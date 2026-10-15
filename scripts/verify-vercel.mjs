import assert from "node:assert/strict";

import { createHmac } from "node:crypto";
import { cp, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import request from "supertest";

// Exercise the actual packaged function away from the repository/node_modules.
// All identities and infrastructure credentials below are test fixtures.
if (!process.env.TEST_DATABASE_URL) throw new Error("Run npm run test:db to verify the packaged function with a disposable PostgreSQL database.");
const artifact = resolve(".vercel/output/functions/private.func");
const output = JSON.parse(await readFile(".vercel/output/config.json", "utf8"));
assert.deepEqual(output.routes?.[0], { src: "/(.*)", dest: "/private" });
// The Vercel CLI appends its standard error fallback after the guarded route.
// Permit that exact fallback while rejecting other routes that could bypass it.
if (output.routes.length > 1) assert.deepEqual(output.routes.slice(1), [
  { handle: "error" },
  { status: 404, src: "^(?!/api).*$", dest: "/404.html" },
]);
assert(!(await readdir(".vercel/output")).includes("static"));
const vc = JSON.parse(await readFile(`${artifact}/.vc-config.json`, "utf8"));
assert.equal(vc.runtime, "nodejs22.x");
assert.equal(vc.shouldAddHelpers, false);
const directory = await mkdtemp(`${tmpdir()}/ropelab-vercel-test-`);
const origin = "https://private.example";
const botToken = "123456789:test-secret-only";
const require = createRequire(import.meta.url);
const savedEnv = { ...process.env };
const savedFetch = globalThis.fetch;
try {
  await cp(artifact, `${directory}/first`, { recursive: true });
  await cp(artifact, `${directory}/second`, { recursive: true });
  const first = require(`${directory}/first/handler.cjs`);
  const second = require(`${directory}/second/handler.cjs`);
  assert.equal(typeof first, "function");
  delete process.env.APP_ORIGIN;
  assert.equal((await request(first).get("/healthz")).status, 503);
  Object.assign(process.env, {
    NODE_ENV: "production", APP_ORIGIN: origin, TELEGRAM_BOT_TOKEN: botToken,
    TELEGRAM_GROUP_ID: "-123", TELEGRAM_LOGIN_CLIENT_ID: "123456789",
    DATABASE_URL: process.env.TEST_DATABASE_URL,
  });
  delete process.env.TELEGRAM_API_ID;
  delete process.env.TELEGRAM_API_HASH;
  // Only fake Telegram identities are used against the disposable test database.
  globalThis.fetch = async (url, options) => {
    assert(String(url).startsWith(`https://api.telegram.org/bot${botToken}/`));
    const method = String(url).split("/").at(-1);
    const args = JSON.parse(options?.body ?? "{}");
    const result = method === "getMe" ? { id: 123456789 }
      : method === "getWebhookInfo" ? { url: "https://example.test/hook" }
      : method === "getChat" ? { id: -123, type: "supergroup", title: "Test event group" }
      : { status: args.user_id === 123456789 ? "administrator" : args.user_id === 234 ? "member" : "left",
        user: { id: args.user_id, is_bot: args.user_id === 123456789, first_name: "Test member" } };
    return { json: async () => ({ ok: true, result }) };
  };
  const get = (handler, path, cookie) => {
    const req = request(handler).get(path).set("Host", "private.example");
    return cookie ? req.set("Cookie", cookie) : req;
  };
  const assets = await readdir(`${artifact}/private/assets`);
  const bundle = `/assets/${assets.find((name) => name.endsWith(".js"))}`;
  assert.equal((await get(first, "/healthz")).status, 200);
  assert.match((await get(first, "/")).text, /Sign in with Telegram/);
  const signin = await get(first, "/signin.js");
  assert.equal(signin.status, 200);
  assert(signin.text.includes("https://oauth.telegram.org"));
  assert(signin.text.includes("origin:window.location.origin"));
  for (const path of [bundle, "/private-rope-jam-poster.jpg", "/api/telegram/group-members?chatId=-123"])
    assert.equal((await get(first, path)).status, 401);
  const fields = { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: 17666600, first_name: "Test admin" }) };
  const check = Object.entries(fields).map(([k, v]) => `${k}=${v}`).join("\n");
  const hmacKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const initData = new URLSearchParams({ ...fields, hash: createHmac("sha256", hmacKey).update(check).digest("hex") }).toString();
  const login = await request(first).post("/api/telegram/authenticate").set("Host", "private.example").set("Origin", origin).send({ initData });
  assert.equal(login.status, 200);
  const cookie = login.headers["set-cookie"][0].split(";")[0];
  assert.equal((await get(second, "/api/telegram/session", cookie)).body.session.isSystemAdmin, true);
  const authorized = await get(second, bundle, cookie);
  assert.equal(authorized.status, 200);
  assert.equal(authorized.headers["cache-control"], "private, no-store");
  for (const detail of ["LabCultural", "Rector Triadó", "2026-10-16T19:00:00"])
    assert(!authorized.text.includes(detail), "Private event content must be fetched after event authorization.");
  const post = (handler, route, sessionCookie, body) => request(handler).post(`/api/telegram/${route}`).set("Host", "private.example").set("Origin", origin).set("Cookie", sessionCookie).send(body);
  assert.equal((await get(first, "/api/telegram/groups", cookie)).status, 200);
  assert.equal((await post(first, "group-approval", cookie, { chatId: "-123", approved: true })).status, 200);
  const memberFields = { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: 234, first_name: "Test member" }) };
  const memberCheck = Object.entries(memberFields).map(([k, v]) => `${k}=${v}`).join("\n");
  const memberProof = new URLSearchParams({ ...memberFields, hash: createHmac("sha256", hmacKey).update(memberCheck).digest("hex") }).toString();
  const memberLogin = await request(first).post("/api/telegram/authenticate").set("Host", "private.example").set("Origin", origin).send({ initData: memberProof });
  assert.equal(memberLogin.status, 200);
  const memberCookie = memberLogin.headers["set-cookie"][0].split(";")[0];
  const invitations = await get(second, "/api/telegram/events", memberCookie);
  assert.equal(invitations.status, 200);
  assert.equal(invitations.body.events.length, 1);
  const eventId = invitations.body.events[0].id;
  const attendancePath = `/api/telegram/attendance?eventId=${encodeURIComponent(eventId)}`;
  const initialAttendance = (await get(first, attendancePath, memberCookie)).body;
  const houseRulesVersion = initialAttendance.rules.version;
  const acceptedRuleIds = ["consent", "respect", "privacy", "non-discrimination", "shared-space"];
  assert.equal(initialAttendance.response, "pending");
  assert.equal(initialAttendance.rules.accepted, false);
  assert.equal((await post(second, "rsvp", memberCookie, { eventId, response: "going" })).status, 428);
  assert.equal((await post(second, "rsvp", memberCookie, { eventId, response: "going", rulesVersion: houseRulesVersion, acceptedRuleIds })).status, 200);
  assert.equal((await get(first, attendancePath, memberCookie)).body.rules.accepted, true);
  const going = await get(first, attendancePath, memberCookie);
  assert.equal(going.body.response, "going");
  assert.equal(going.body.people.length, 1);
  assert.equal((await post(first, "rsvp", memberCookie, { eventId, response: "not-going" })).status, 200);
  assert.equal((await get(second, attendancePath, memberCookie)).body.people.length, 0);
  assert.equal((await post(second, "group-approval", cookie, { chatId: "-123", approved: false })).status, 200);
  assert.deepEqual((await get(first, "/api/telegram/events", memberCookie)).body.events, []);
  assert.equal((await get(second, "/private-rope-jam-poster.jpg", memberCookie)).status, 403);
  assert.equal((await request(second).post("/api/telegram/logout").set("Host", "private.example").set("Origin", origin).set("Cookie", cookie)).status, 200);
  assert.equal((await get(first, bundle, cookie)).status, 401);
  console.log("Packaged Vercel function verified: shared sessions and RSVPs, group revocation, protected event content, private files, no public static assets.");
} finally {
  globalThis.fetch = savedFetch;
  process.env = savedEnv;
  await rm(directory, { recursive: true, force: true });
}
