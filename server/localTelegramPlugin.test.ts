import { createHmac } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { allowLocalRosterRequest, createLocalTelegramMiddleware } from "./localTelegramPlugin";

describe("private local roster endpoint", () => {
  const local = { remoteAddress: "127.0.0.1", host: "127.0.0.1:5178", origin: "http://127.0.0.1:5178", fetchSite: "same-origin" };

  it("allows the local app", () => {
    expect(allowLocalRosterRequest(local)).toBe(true);
    expect(allowLocalRosterRequest({ ...local, remoteAddress: "::1" })).toBe(true);
  });

  it("rejects remote clients, rebinding hosts, and cross-origin pages", () => {
    for (const change of [
      { remoteAddress: "192.168.1.2" }, { host: "attacker.example:5178" },
      { origin: "https://attacker.example" }, { fetchSite: "cross-site" },
      { origin: "http://localhost:5178" },
    ]) expect(allowLocalRosterRequest({ ...local, ...change })).toBe(false);
  });
});

// Exercise the HTTP boundary without opening a listening socket.

const testToken = "123456789:test-secret-only";
function launchData(id: number) {
  const fields = { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: "Test user" }) };
  const check = Object.entries(fields).map(([key, value]) => `${key}=${value}`).join("\n");
  const key = createHmac("sha256", "WebAppData").update(testToken).digest();
  return new URLSearchParams({ ...fields, hash: createHmac("sha256", key).update(check).digest("hex") }).toString();
}

function setup(base = "/") {
  const roster = { title: "Test group", members: [], totalMembers: 0, complete: true, checkedAt: new Date().toISOString() };
  const loader = vi.fn().mockResolvedValue(roster);
  const middleware = createLocalTelegramMiddleware(() => ({ token: testToken, chatId: "-123", loginClientId: "123456789" }), loader, base);
  async function request(route: string, options: { body?: unknown; cookie?: string; origin?: string; method?: string } = {}) {
    const headers = new Map<string, unknown>();
    let result = "";
    const req = Object.assign(Readable.from(options.body === undefined ? [] : [JSON.stringify(options.body)]), {
      url: `${base}__local/telegram/${route}`,
      method: options.method ?? (options.body === undefined ? "GET" : "POST"),
      socket: { remoteAddress: "127.0.0.1" },
      headers: { host: "127.0.0.1:5178", origin: options.origin ?? "http://127.0.0.1:5178", "content-type": "application/json", cookie: options.cookie },
    }) as unknown as IncomingMessage;
    const res = { statusCode: 200, setHeader: (key: string, value: unknown) => { headers.set(key, value); }, removeHeader: (key: string) => { headers.delete(key); }, end: (value: string) => { result = value; } };
    await middleware(req, res as unknown as ServerResponse, () => { throw new Error("Unexpected middleware bypass"); });
    return { status: res.statusCode, body: JSON.parse(result), headers };
  }
  return { request, loader, roster };
}
function sessionCookie(headers: Map<string, unknown>) {
  return (headers.get("Set-Cookie") as string[])[0].split(";")[0];
}

describe("system administrator HTTP access", () => {
  it("withholds the roster from anonymous and forged-cookie requests", async () => {
    const { request, loader } = setup();
    expect((await request("group-members?chatId=-123")).status).toBe(401);
    expect((await request("group-members?chatId=-123", { cookie: "ropelab_telegram_session=17666600" })).status).toBe(401);
    expect(loader).not.toHaveBeenCalled();
  });

  it("restores an admin session, protects the configured group and revokes access after logout", async () => {
    const { request, loader, roster } = setup();
    const login = await request("authenticate", { body: { initData: launchData(17666600) } });
    expect(login.status).toBe(200);
    expect(login.body.session.isSystemAdmin).toBe(true);
    expect((login.headers.get("Set-Cookie") as string[])[0]).toContain("HttpOnly; SameSite=Strict");
    const cookie = sessionCookie(login.headers);
    expect((await request("session", { cookie })).body.session.user.id).toBe(17666600);
    expect((await request("group-members?chatId=-999", { cookie })).status).toBe(404);
    expect(loader).not.toHaveBeenCalled();
    const list = await request("group-members?chatId=-123", { cookie });
    expect(list.status).toBe(200);
    expect(list.body).toEqual(roster);
    await request("logout", { cookie, method: "POST" });
    expect((await request("session", { cookie })).body.session).toBeNull();
    expect((await request("group-members?chatId=-123", { cookie })).status).toBe(401);
  });

  it("denies other authenticated users and does not accept a client-supplied admin role", async () => {
    const { request, loader } = setup();
    const login = await request("authenticate", { body: { initData: launchData(8446889371), isSystemAdmin: true, user: { id: 17666600 } } });
    expect(login.status).toBe(200);
    expect(login.body.session.isSystemAdmin).toBe(false);
    expect((await request("group-members?chatId=-123", { cookie: sessionCookie(login.headers) })).status).toBe(403);
    expect(loader).not.toHaveBeenCalled();
    expect((await request("authenticate", { body: { user: { id: 17666600 }, isSystemAdmin: true } })).status).toBe(401);
  });

  it("rejects cross-site authentication, logout, and malformed proofs", async () => {
    const { request } = setup();
    expect((await request("authenticate", { origin: "https://attacker.example", body: { initData: launchData(17666600) } })).status).toBe(403);
    expect((await request("logout", { origin: "null", method: "POST" })).status).toBe(403);
    expect((await request("authenticate", { body: { initData: "invalid" } })).status).toBe(401);
    expect((await request("authenticate", { body: { idToken: "unsigned-jwt" } })).status).toBe(401);
  });

  it("withholds an in-flight roster when the admin signs out", async () => {
    const { request, loader, roster } = setup();
    let finish: (value: typeof roster) => void = () => {};
    loader.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const login = await request("authenticate", { body: { initData: launchData(17666600) } });
    const cookie = sessionCookie(login.headers);
    const pending = request("group-members?chatId=-123", { cookie });
    await request("logout", { cookie, method: "POST" });
    finish(roster);
    expect((await pending).status).toBe(401);
  });

  it("supports the app base path for authentication and sessions", async () => {
    const { request } = setup("/tg-app/");
    const login = await request("authenticate", { body: { initData: launchData(17666600) } });
    expect(login.status).toBe(200);
    expect((login.headers.get("Set-Cookie") as string[])[0]).toContain("Path=/tg-app/");
    expect((await request("session", { cookie: sessionCookie(login.headers) })).body.session.isSystemAdmin).toBe(true);
  });
});
