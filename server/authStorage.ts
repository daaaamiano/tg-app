import { createHash, randomBytes } from "node:crypto";
import type { Attendee } from "../src/types/event";
import type { OrganizationSession } from "../src/types/organization";
import { isSystemAdmin, SESSION_SECONDS, type SessionStore } from "./telegramAuth";

export class AuthStorageError extends Error {
  constructor() { super("Sign-in storage is temporarily unavailable."); }
}
export interface LoginChallenge { nonce: string; expiresAt: number }
export interface LoginState {
  put(id: string, value: LoginChallenge): void | Promise<void>;
  consume(id: string | undefined): LoginChallenge | undefined | Promise<LoginChallenge | undefined>;
  revoke(id: string | undefined): void | Promise<void>;
  allowLogin(): boolean | Promise<boolean>;
}

// Local development only. Hosted handlers use the same PostgreSQL database for auth and group approvals.
export class MemoryLoginState implements LoginState {
  private challenges = new Map<string, LoginChallenge>();
  private window = { startsAt: Date.now(), attempts: 0 };
  put(id: string, value: LoginChallenge) {
    for (const [key, item] of this.challenges) if (item.expiresAt <= Date.now()) this.challenges.delete(key);
    this.challenges.set(id, value);
  }
  consume(id: string | undefined) {
    if (!id) return undefined;
    const value = this.challenges.get(id);
    this.challenges.delete(id);
    return value;
  }
  revoke(id: string | undefined) { if (id) this.challenges.delete(id); }
  allowLogin() {
    if (Date.now() - this.window.startsAt >= 60000) this.window = { startsAt: Date.now(), attempts: 0 };
    return ++this.window.attempts <= 120;
  }
}

export type DatabaseQuery = (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const validToken = (value: string | undefined): value is string => !!value && /^[\w-]{43}$/.test(value);

export function createDatabaseAuthStorage(query: DatabaseQuery, origin: string): { sessions: SessionStore; loginState: LoginState } {
  const namespace = digest(origin);
  const run: DatabaseQuery = async (sql, values) => {
    try { return await query(sql, values); } catch { throw new AuthStorageError(); }
  };
  const sessionFromRow = (row: Record<string, unknown> | undefined, now: number): OrganizationSession | null => {
    if (!row) return null;
    const user = row.user_profile as Attendee;
    const expiresAt = new Date(row.expires_at as string | Date).getTime();
    if (!user || typeof user.id !== "number" || !Number.isSafeInteger(user.id) || user.id <= 0 ||
        typeof user.first_name !== "string" || !Number.isFinite(expiresAt)) throw new AuthStorageError();
    if (expiresAt <= now) return null;
    return { user, expiresAt, isSystemAdmin: isSystemAdmin(user) };
  };
  return {
    sessions: {
      async create(user, now = Date.now()) {
        // Small tables: prune expired auth data on sign-in, without a scheduled job.
        await run("DELETE FROM app_sessions WHERE expires_at <= $1", [new Date(now)]);
        await run("DELETE FROM login_challenges WHERE expires_at <= $1", [new Date(now)]);
        await run("DELETE FROM login_windows WHERE window_start < $1", [Math.floor(now / 60000) - 1]);
        const token = randomBytes(32).toString("base64url");
        const expiresAt = now + SESSION_SECONDS * 1000;
        await run("INSERT INTO app_sessions (namespace, token_hash, user_profile, expires_at) VALUES ($1, $2, $3, $4)",
          [namespace, digest(token), JSON.stringify(user), new Date(expiresAt)]);
        return { token, session: { user: { ...user }, expiresAt, isSystemAdmin: isSystemAdmin(user) } };
      },
      async get(token, now = Date.now()) {
        if (!validToken(token)) return null;
        const result = await run("SELECT user_profile, expires_at FROM app_sessions WHERE namespace = $1 AND token_hash = $2", [namespace, digest(token)]);
        return sessionFromRow(result.rows[0], now);
      },
      async revoke(token) {
        if (validToken(token)) await run("DELETE FROM app_sessions WHERE namespace = $1 AND token_hash = $2", [namespace, digest(token)]);
      },
    },
    loginState: {
      async put(id, value) {
        await run("INSERT INTO login_challenges (namespace, token_hash, nonce, expires_at) VALUES ($1, $2, $3, $4)",
          [namespace, digest(id), value.nonce, new Date(value.expiresAt)]);
      },
      async consume(id) {
        if (!validToken(id)) return undefined;
        // One atomic SQL statement prevents concurrent logins from reusing a challenge.
        const result = await run("DELETE FROM login_challenges WHERE namespace = $1 AND token_hash = $2 RETURNING nonce, expires_at", [namespace, digest(id)]);
        const row = result.rows[0];
        if (!row) return undefined;
        const expiresAt = new Date(row.expires_at as string | Date).getTime();
        if (typeof row.nonce !== "string" || !Number.isFinite(expiresAt)) throw new AuthStorageError();
        return { nonce: row.nonce, expiresAt };
      },
      async revoke(id) {
        if (validToken(id)) await run("DELETE FROM login_challenges WHERE namespace = $1 AND token_hash = $2", [namespace, digest(id)]);
      },
      async allowLogin() {
        const result = await run(`INSERT INTO login_windows (namespace, window_start, attempts) VALUES ($1, $2, 1)
          ON CONFLICT (namespace, window_start) DO UPDATE SET attempts = login_windows.attempts + 1 RETURNING attempts`,
          [namespace, Math.floor(Date.now() / 60000)]);
        const count = result.rows[0]?.attempts;
        if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 1) throw new AuthStorageError();
        return count <= 120;
      },
    },
  };
}
