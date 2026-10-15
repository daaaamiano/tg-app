import express from "express";
import { readFileSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
import { TelegramSessions, type SessionStore } from "./telegramAuth";
import { AuthStorageError, type LoginState } from "./authStorage";
import type { TelegramServerConfig } from "./telegramConfig";
import { allowHostedRequest, cookieValue, createTelegramMiddleware, sessionCookieName } from "./telegramMiddleware";
import { loadGroupRoster } from "./telegramMembers";
import { loginCss, loginPage } from "./loginPage";
import { createGroupAccess, createMemoryGroupStore, GroupAccessError, type GroupAccess } from "./groupAccess";
import { canViewEvents, createMemoryUserAccessStore, type UserAccessStore } from "./userAccess";
import { createEventAttendance, createMemoryAttendanceStore, type AttendanceStore } from "./eventAttendance";
import { eventCatalog } from "../src/data/eventCatalog";
import type { AttendanceNotifier } from "./attendanceNotification";

export function validatePrivateBuild(dist: string) {
  let marker: unknown;
  try { marker = JSON.parse(readFileSync(resolve(dist, ".private-service.json"), "utf8")); }
  catch { throw new Error("Build the private app with npm run build:service before starting it."); }
  if (!marker || typeof marker !== "object" || (marker as { privateService?: unknown }).privateService !== true)
    throw new Error("The frontend must be built for the private service.");
}

export function createPrivateService({ origin, dist, config, secureCookies, rosterLoader = loadGroupRoster, sessions = new TelegramSessions(), loginState, groups = createGroupAccess(createMemoryGroupStore(), () => config), users = createMemoryUserAccessStore(), attendance = createMemoryAttendanceStore(), attendanceNotifier }: {
  origin: string; dist: string; config: TelegramServerConfig; secureCookies: boolean;
  rosterLoader?: typeof loadGroupRoster;
  sessions?: SessionStore; loginState?: LoginState;
  groups?: GroupAccess;
  users?: UserAccessStore;
  attendance?: AttendanceStore;
  attendanceNotifier?: AttendanceNotifier;
}) {
  const app = express();
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("Content-Security-Policy", "frame-ancestors 'self' https://web.telegram.org; base-uri 'self'; object-src 'none'");
    next();
  });
  // Infrastructure probes reveal no configuration or member/event data.
  app.get("/healthz", (_req, res) => { res.json({ ok: true }); });
  app.use((req, res, next) => {
    const pageNavigation = ["GET", "HEAD"].includes(req.method) &&
      ["/", "/index.html", "/login", "/login/"].includes(req.path);
    if (!allowHostedRequest({ host: req.headers.host, origin: req.headers.origin,
      // A normal link from Telegram/another website may open the sign-in page.
      // APIs and files still reject cross-site requests; all private pages still require the admin session below.
      fetchSite: pageNavigation ? undefined : req.headers["sec-fetch-site"] as string | undefined }, origin)) {
      res.status(403).json({ error: "Open the app from its configured address." }); return;
    }
    next();
  });

  // APIs and file serving use the same session store; the server derives every role.
  app.use(createTelegramMiddleware(() => config, {
    prefix: "/api/telegram/", localOnly: false, origin, secureCookies, sessions, loginState, rosterLoader, groups, users, attendance, attendanceNotifier,
  }));
  app.use("/api", (_req, res) => { res.status(404).json({ error: "Unknown API endpoint." }); });
  app.get("/signin.css", (_req, res) => { res.type("css").send(loginCss); });
  app.get("/signin.js", (_req, res) => { res.sendFile(resolve(dist, "signin.js")); });

  // Check current group membership for every private response, including existing sessions.
  app.use(async (req, res, next) => {
    const session = await sessions.get(cookieValue(req, sessionCookieName(secureCookies)));
    if (session?.isSystemAdmin) return next();
    if (session && await canViewEvents(Number(session.user.id), groups, users) && await sessions.get(cookieValue(req, sessionCookieName(secureCookies)))) return next();
    if (["/", "/index.html", "/login", "/login/"].includes(req.path) && ["GET", "HEAD"].includes(req.method)) {
      res.status(session ? 403 : 200).type("html").send(loginPage); return;
    }
    res.status(session ? 403 : 401).json({ error: "Sign in with an authorized Telegram account to continue." });
  });
  app.get(["/", "/login", "/login/"], (_req, res) => { res.sendFile(resolve(dist, "index.html")); });
  const events = createEventAttendance({ store: attendance, groups, users, configReader: () => config, rosterLoader });
  // Function-bundled assets are sent only after the gate above. Vercel's static CDN
  // must never receive the event build, and Express static middleware is unsupported there.
  app.use(async (req, res, next) => {
    if (!["GET", "HEAD"].includes(req.method)) return next();
    let path: string;
    try { path = decodeURIComponent(req.path); } catch { return next(); }
    if (path.includes("\\") || path.split("/").some((part) => part.startsWith("."))) return next();
    const file = resolve(dist, `.${path}`);
    const within = relative(resolve(dist), file);
    if (!within || within.startsWith("..") || isAbsolute(within)) return next();
    // Authorize the resolved file, including encoded and trailing-slash URL aliases.
    const posterEvent = eventCatalog.find(event => resolve(dist, `.${event.poster}`) === file);
    if (posterEvent) {
      const token = cookieValue(req, sessionCookieName(secureCookies));
      const session = await sessions.get(token);
      if (!session || !await events.canViewEvent(session, posterEvent.id) || !await sessions.get(token)) {
        res.status(session ? 403 : 401).json({ error: "This event invitation is not available." }); return;
      }
    }
    res.sendFile(file, { dotfiles: "deny", cacheControl: false }, (error) => { if (error) next(error); });
  });
  app.use((_req, res) => { res.status(404).json({ error: "Page not found." }); });
  app.use(((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = error instanceof GroupAccessError ? error.status : error instanceof AuthStorageError ? 503 : error && typeof error === "object" && "status" in error && error.status === 404 ? 404 : 500;
    res.status(status).json({ error: status === 404 ? "Page not found." : status === 503 ? "Sign-in storage is temporarily unavailable. Please try again." : "The request could not be completed." });
  }) as express.ErrorRequestHandler);
  return app;
}
