import { createHash } from "node:crypto";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { AuthStorageError, createDatabaseAuthStorage } from "./authStorage";
import { databaseConnectionFromEnv } from "./database";
import { SESSION_SECONDS } from "./telegramAuth";

const pool = process.env.TEST_DATABASE_URL ? new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 2 }) : undefined;
afterAll(async () => { await pool?.end(); });
const query = (sql: string, values?: unknown[]) => pool!.query(sql, values);
const dbTest = process.env.TEST_DATABASE_URL ? it : it.skip;
const origin = "https://database-auth.example";

describe("single PostgreSQL auth database", () => {
  dbTest("restores and revokes hashed sessions across instances, with expiry and origin isolation", async () => {
    const a = createDatabaseAuthStorage(query, origin);
    const b = createDatabaseAuthStorage(query, origin);
    const preview = createDatabaseAuthStorage(query, "https://preview.example");
    const now = Date.now();
    const { token } = await a.sessions.create({ id: 17666600, first_name: "Admin" }, now);
    expect((await b.sessions.get(token, now))?.isSystemAdmin).toBe(true);
    expect(await preview.sessions.get(token, now)).toBeNull();
    expect(await b.sessions.get(token, now + SESSION_SECONDS * 1000)).toBeNull();
    const rows = await query("SELECT token_hash FROM app_sessions WHERE namespace = $1", [createHash("sha256").update(origin).digest("hex")]);
    expect(rows.rows[0].token_hash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(rows.rows[0].token_hash).not.toBe(token);
    await b.sessions.revoke(token);
    expect(await a.sessions.get(token, now)).toBeNull();
  });

  dbTest("derives roles from the verified ID and rejects malformed database profiles", async () => {
    const { sessions } = createDatabaseAuthStorage(query, origin);
    const { token } = await sessions.create({ id: 123, first_name: "Other" });
    const hash = createHash("sha256").update(token).digest("hex");
    await query("UPDATE app_sessions SET user_profile = user_profile || '{\"isSystemAdmin\":true}'::jsonb WHERE token_hash = $1", [hash]);
    expect((await sessions.get(token))?.isSystemAdmin).toBe(false);
    await query("UPDATE app_sessions SET user_profile = 'null'::jsonb WHERE token_hash = $1", [hash]);
    await expect(sessions.get(token)).rejects.toBeInstanceOf(AuthStorageError);
  });

  dbTest("consumes challenges once across concurrent instances and shares the atomic throttle", async () => {
    const a = createDatabaseAuthStorage(query, origin).loginState;
    const b = createDatabaseAuthStorage(query, origin).loginState;
    const id = "a".repeat(43);
    await a.put(id, { nonce: "nonce", expiresAt: Date.now() + 300000 });
    const results = await Promise.all([a.consume(id), b.consume(id)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    await a.put(id, { nonce: "nonce", expiresAt: Date.now() + 300000 });
    await b.revoke(id);
    expect(await a.consume(id)).toBeUndefined();
    const allowed = await Promise.all(Array.from({ length: 121 }, (_, i) => (i % 2 ? a : b).allowLogin()));
    expect(allowed.filter(Boolean)).toHaveLength(120);
    expect(allowed.filter((value) => !value)).toHaveLength(1);
  });

  it("fails closed and redacts connection errors", async () => {
    const outage = createDatabaseAuthStorage(async () => { throw new Error("private database credentials"); }, origin);
    await expect(outage.sessions.get("a".repeat(43))).rejects.toThrow("Sign-in storage is temporarily unavailable.");
    await expect(outage.loginState.consume("a".repeat(43))).rejects.toBeInstanceOf(AuthStorageError);
  });

  it("requires PostgreSQL configuration and enforces certificate verification for hosted connections", () => {
    expect(() => databaseConnectionFromEnv({})).toThrow();
    expect(() => databaseConnectionFromEnv({ DATABASE_URL: "https://database.example" })).toThrow();
    const url = new URL(databaseConnectionFromEnv({ DATABASE_URL: "postgresql://user:fake-secret@database.example/app?sslmode=disable" }));
    expect(url.searchParams.get("sslmode")).toBe("verify-full");
    expect(databaseConnectionFromEnv({ DATABASE_URL: "postgresql://postgres@127.0.0.1:54817/postgres?sslmode=disable" })).toContain("sslmode=disable");
  });
});
