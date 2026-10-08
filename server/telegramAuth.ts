import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { Attendee } from "../src/types/event";
import type { OrganizationSession } from "../src/types/organization";

// Only a cryptographically verified Telegram identity can match this policy.
export const SYSTEM_ADMIN_TELEGRAM_ID = "17666600";
export const SESSION_SECONDS = 8 * 60 * 60;
const MAX_LOGIN_AGE_SECONDS = 300;
const telegramKeys = createRemoteJWKSet(new URL("https://oauth.telegram.org/.well-known/jwks.json"), { timeoutDuration: 8000 });

function userIdentity(value: unknown): Attendee {
  if (!value || typeof value !== "object") throw new Error("Invalid Telegram profile.");
  const user = value as Record<string, unknown>;
  if (typeof user.id !== "number" || !Number.isSafeInteger(user.id) || user.id <= 0 ||
      typeof user.first_name !== "string" || !user.first_name.trim() || user.is_bot === true)
    throw new Error("Invalid Telegram profile.");
  return {
    id: user.id, first_name: user.first_name,
    last_name: typeof user.last_name === "string" ? user.last_name : undefined,
    username: typeof user.username === "string" ? user.username : undefined,
  };
}

export function verifyMiniAppData(initData: unknown, botToken: string, now = Date.now()): Attendee {
  if (typeof initData !== "string" || !initData || initData.length > 16384)
    throw new Error("Open the app again in Telegram to sign in.");
  const fields = new URLSearchParams(initData);
  if ([...fields.keys()].some((key) => fields.getAll(key).length !== 1))
    throw new Error("Invalid Telegram sign-in.");
  const hash = fields.get("hash") ?? "";
  if (!/^[a-f0-9]{64}$/i.test(hash)) throw new Error("Invalid Telegram sign-in.");
  fields.delete("hash");
  const checkString = [...fields.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`).join("\n");
  const key = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", key).update(checkString).digest();
  if (!timingSafeEqual(expected, Buffer.from(hash, "hex"))) throw new Error("Invalid Telegram sign-in.");
  const dateValue = fields.get("auth_date") ?? "";
  const date = Number(dateValue);
  const current = Math.floor(now / 1000);
  if (!/^\d+$/.test(dateValue) || !Number.isSafeInteger(date) || date < current - MAX_LOGIN_AGE_SECONDS || date > current + 30)
    throw new Error("Telegram sign-in expired. Open the app again.");
  return userIdentity(JSON.parse(fields.get("user") ?? "null"));
}

export async function verifyBrowserToken(token: string, clientId: string, nonce: string, keys: JWTVerifyGetKey = telegramKeys): Promise<Attendee> {
  const { payload } = await jwtVerify(token, keys, {
    issuer: "https://oauth.telegram.org", audience: clientId, algorithms: ["RS256", "ES256"],
    requiredClaims: ["exp", "iat", "nonce"], maxTokenAge: "5m", clockTolerance: 30,
  });
  if (payload.nonce !== nonce) throw new Error("Invalid Telegram sign-in challenge.");
  // OIDC `sub` is a different identifier. Authorization uses Telegram's profile `id`.
  return userIdentity({
    id: payload.id,
    first_name: payload.given_name ?? payload.name,
    last_name: payload.family_name,
    username: payload.preferred_username,
  });
}

export function isSystemAdmin(user: Attendee): boolean {
  return String(user.id) === SYSTEM_ADMIN_TELEGRAM_ID;
}

type Awaitable<T> = T | Promise<T>;
export interface SessionStore {
  create(user: Attendee, now?: number): Awaitable<{ token: string; session: OrganizationSession }>;
  get(token: string | undefined, now?: number): Awaitable<OrganizationSession | null>;
  revoke(token: string | undefined): Awaitable<void>;
}

export class TelegramSessions {
  private sessions = new Map<string, { user: Attendee; expiresAt: number }>();
  private digest(token: string) { return createHash("sha256").update(token).digest("hex"); }

  create(user: Attendee, now = Date.now()) {
    for (const [key, value] of this.sessions) if (value.expiresAt <= now) this.sessions.delete(key);
    const token = randomBytes(32).toString("base64url");
    this.sessions.set(this.digest(token), { user: { ...user }, expiresAt: now + SESSION_SECONDS * 1000 });
    return { token, session: this.get(token, now)! };
  }

  get(token: string | undefined, now = Date.now()): OrganizationSession | null {
    if (!token) return null;
    const key = this.digest(token);
    const value = this.sessions.get(key);
    if (!value) return null;
    if (value.expiresAt <= now) { this.sessions.delete(key); return null; }
    return { user: { ...value.user }, expiresAt: value.expiresAt, isSystemAdmin: isSystemAdmin(value.user) };
  }

  revoke(token: string | undefined) { if (token) this.sessions.delete(this.digest(token)); }
}
