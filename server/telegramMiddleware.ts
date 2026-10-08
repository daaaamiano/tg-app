import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { loadGroupRoster } from "./telegramMembers";
import type { TelegramServerConfig } from "./telegramConfig";
import { SESSION_SECONDS, TelegramSessions, verifyBrowserToken, verifyMiniAppData, type SessionStore } from "./telegramAuth";

import { AuthStorageError, MemoryLoginState, type LoginState } from "./authStorage";
import { createGroupAccess, createMemoryGroupStore, GroupAccessError, type GroupAccess } from "./groupAccess";

export function allowLocalRosterRequest({ remoteAddress, host, origin, fetchSite }: {
  remoteAddress?: string; host?: string; origin?: string; fetchSite?: string;
}): boolean {
  return ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remoteAddress ?? "") &&
    ["127.0.0.1:5178", "localhost:5178"].includes(host ?? "") &&
    (!origin || origin === `http://${host}`) &&
    (!fetchSite || fetchSite === "same-origin" || fetchSite === "none");
}

export function allowHostedRequest(boundary: { host?: string; origin?: string; fetchSite?: string }, origin: string) {
  return boundary.host === new URL(origin).host &&
    (!boundary.origin || boundary.origin === origin) &&
    (!boundary.fetchSite || boundary.fetchSite === "same-origin" || boundary.fetchSite === "none");
}

export function sessionCookieName(secure: boolean) {
  return secure ? "__Host-ropelab_telegram_session" : "ropelab_telegram_session";
}

export function cookieValue(req: IncomingMessage, name: string) {
  return req.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  let body = "";
  for await (const chunk of req) {
    body += chunk.toString();
    if (Buffer.byteLength(body) > 16384) throw new Error("Sign-in request is too large.");
  }
  const parsed: unknown = JSON.parse(body);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid sign-in request.");
  return parsed as Record<string, unknown>;
}

export interface TelegramMiddlewareOptions {
  prefix: string;
  cookiePath?: string;
  origin?: string;
  localOnly: boolean;
  secureCookies?: boolean;
  sessions?: SessionStore;
  loginState?: LoginState;
  rosterLoader?: typeof loadGroupRoster;
  groups?: GroupAccess;
}

export function createTelegramMiddleware(configReader: () => TelegramServerConfig, options: TelegramMiddlewareOptions) {
  const base = options.cookiePath ?? "/";
  const rosterLoader = options.rosterLoader ?? loadGroupRoster;
  const sessions = options.sessions ?? new TelegramSessions();
  const loginState = options.loginState ?? new MemoryLoginState();
  const groups = options.groups ?? createGroupAccess(createMemoryGroupStore(), configReader);
  const prefix = options.prefix;
  const sessionCookie = sessionCookieName(options.secureCookies === true);
  const challengeCookie = options.secureCookies ? "__Host-ropelab_telegram_challenge" : "ropelab_telegram_challenge";
  let active: ReturnType<typeof loadGroupRoster> | undefined;
  let activeChatId: string | undefined;

  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1:5178");
    if (!url.pathname.startsWith(prefix)) return next();
    const route = url.pathname.slice(prefix.length);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Type", "application/json");
    res.removeHeader("Access-Control-Allow-Origin");
    const send = (status: number, value: unknown) => { res.statusCode = status; res.end(JSON.stringify(value)); };
    const setCookie = (name: string, value: string, age: number) => `${name}=${value}; HttpOnly; SameSite=${options.secureCookies ? "None" : "Strict"}; Path=${base}; Max-Age=${age}${options.secureCookies ? "; Secure" : ""}`;
    const boundary = { remoteAddress: req.socket.remoteAddress, host: req.headers.host,
      origin: req.headers.origin, fetchSite: req.headers["sec-fetch-site"] as string | undefined };
    if (!(options.localOnly ? allowLocalRosterRequest(boundary) : allowHostedRequest(boundary, options.origin!)))
      return send(403, { error: "Open Telegram administration from this app." });
    const origin = options.localOnly ? `http://${req.headers.host}` : options.origin!;
    const method = ["authenticate", "logout", "login-challenge", "group-approval"].includes(route) ? "POST" : "GET";
    if (req.method !== method) { res.setHeader("Allow", method); return send(405, { error: `Use ${method} for this request.` }); }
    // All mutations require an explicit exact Origin, including login and logout.
    if (method === "POST" && req.headers.origin !== origin)
      return send(403, { error: "Open sign-in from this app." });
    try {
      if (!options.localOnly && ["authenticate", "login-challenge"].includes(route)) {
        if (!await loginState.allowLogin()) {
          res.setHeader("Retry-After", "60");
          return send(429, { error: "Too many sign-in attempts. Please wait a minute and try again." });
        }
      }
      const token = cookieValue(req, sessionCookie);
      if (route === "session") {
        const session = await sessions.get(token);
        const canViewEvents = session ? session.isSystemAdmin || await groups.canViewEvents(Number(session.user.id)) : false;
        return send(200, { session: session && await sessions.get(token) ? { ...session, canViewEvents } : null });
      }
      if (route === "logout") {
        await sessions.revoke(token);
        const challenge = cookieValue(req, challengeCookie);
        await loginState.revoke(challenge);
        res.setHeader("Set-Cookie", [setCookie(sessionCookie, "", 0), setCookie(challengeCookie, "", 0)]);
        return send(200, { ok: true });
      }
      if (route === "login-challenge") {
        try {
          const config = configReader();
          if (!/^\d+$/.test(config.loginClientId)) throw new Error("Configure TELEGRAM_LOGIN_CLIENT_ID in .env.server.local.");
          const previous = cookieValue(req, challengeCookie);
          await loginState.revoke(previous);
          const id = randomBytes(32).toString("base64url");
          const nonce = randomBytes(32).toString("base64url");
          await loginState.put(id, { nonce, expiresAt: Date.now() + 300000 });
          res.setHeader("Set-Cookie", setCookie(challengeCookie, id, 300));
          return send(200, { clientId: Number(config.loginClientId), nonce });
        } catch { return send(503, { error: "Telegram browser sign-in is not configured yet." }); }
      }
      if (route === "authenticate") {
        let config: TelegramServerConfig;
        try { config = configReader(); } catch { return send(503, { error: "Telegram sign-in is not configured yet." }); }
        try {
          if (!req.headers["content-type"]?.startsWith("application/json")) return send(415, { error: "Use a JSON sign-in request." });
          const body = await readBody(req);
          let user;
          if (typeof body.initData === "string") {
            user = verifyMiniAppData(body.initData, config.token);
          } else if (typeof body.idToken === "string") {
            const id = cookieValue(req, challengeCookie);
            const challenge = await loginState.consume(id);
            if (!challenge || challenge.expiresAt <= Date.now()) throw new Error("Expired sign-in challenge.");
            user = await verifyBrowserToken(body.idToken, config.loginClientId, challenge.nonce);
          } else throw new Error("Missing Telegram proof.");
          await sessions.revoke(token);
          const created = await sessions.create(user);
          const canViewEvents = created.session.isSystemAdmin || await groups.canViewEvents(Number(user.id));
          res.setHeader("Set-Cookie", [setCookie(sessionCookie, created.token, SESSION_SECONDS), setCookie(challengeCookie, "", 0)]);
          return send(200, { session: { ...created.session, canViewEvents } });
        } catch (error) {
          if (error instanceof AuthStorageError || error instanceof GroupAccessError) throw error;
          return send(401, { error: "Telegram sign-in could not be verified. Please sign in again." });
        }
      }
      if (!["group-members", "groups", "group-approval"].includes(route)) return send(404, { error: "Unknown Telegram endpoint." });
      const session = await sessions.get(token);
      if (!session) return send(401, { error: "Sign in with Telegram to view organization members." });
      if (!session.isSystemAdmin) return send(403, { error: "Only the system administrator can view organization members." });
      if (route === "groups") {
        const known = await groups.list();
        if (!(await sessions.get(token))?.isSystemAdmin) return send(401, { error: "Your admin session expired. Sign in again." });
        return send(200, { groups: known });
      }
      if (route === "group-approval") {
        if (!req.headers["content-type"]?.startsWith("application/json")) return send(415, { error: "Use a JSON request." });
        let body;
        try { body = await readBody(req); } catch { return send(400, { error: "Choose a group and approval state." }); }
        if (typeof body.chatId !== "string" || typeof body.approved !== "boolean") return send(400, { error: "Choose a group and approval state." });
        await groups.setApproval(body.chatId, body.approved, Number(session.user.id), async () => (await sessions.get(token))?.isSystemAdmin === true);
        return send(200, { ok: true });
      }
      try {
        const config = configReader();
        const chatId = url.searchParams.get("chatId") ?? "";
        if (chatId !== config.chatId && !await groups.hasGroup(chatId))
          return send(404, { error: "This group is not configured for member viewing." });
        // Coalesce only requests for the same group.
        if (!active || activeChatId !== chatId) {
          activeChatId = chatId;
          const loading = rosterLoader({ ...config, chatId });
          active = loading;
          void loading.finally(() => { if (active === loading) active = undefined; }).catch(() => {});
        }
        const roster = await active;
        // A logout/expiry during Telegram's response must also withhold the roster.
        if (!(await sessions.get(token))?.isSystemAdmin) return send(401, { error: "Your admin session expired. Sign in again." });
        return send(200, roster);
      } catch (error) {
        send(503, { error: options.localOnly && error instanceof Error ? error.message : "The member list could not be loaded. Please try again." });
      }
    } catch (error) {
      if (error instanceof GroupAccessError) return send(error.status, { error: error.message });
      send(503, { error: "Sign-in storage is temporarily unavailable. Please try again." });
    }
  };
}
