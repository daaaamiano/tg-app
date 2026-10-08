import pg from "pg";
import type { DatabaseQuery } from "./authStorage";

export function databaseConnectionFromEnv(env: NodeJS.ProcessEnv): string {
  if (!env.DATABASE_URL) throw new Error("Configure the private DATABASE_URL for PostgreSQL.");
  const url = new URL(env.DATABASE_URL);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname)
    throw new Error("DATABASE_URL must be a PostgreSQL connection URL.");
  // Local integration tests use a disposable loopback server. Hosted connections verify TLS.
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    url.searchParams.set("sslmode", "verify-full");
    if (url.searchParams.has("sslrootcert") || url.searchParams.has("sslcert") || url.searchParams.has("sslkey"))
      throw new Error("Use a PostgreSQL provider with a publicly trusted TLS certificate.");
  }
  return url.toString();
}

export function databaseFromEnv(env: NodeJS.ProcessEnv) {
  const pool = new pg.Pool({
    connectionString: databaseConnectionFromEnv(env), max: 2,
    connectionTimeoutMillis: 8000, idleTimeoutMillis: 10000,
    statement_timeout: 8000, query_timeout: 10000, allowExitOnIdle: true,
  });
  // Avoid leaking connection strings or database credentials in runtime errors.
  pool.on("error", () => console.error("Database connection unavailable."));
  const query: DatabaseQuery = (sql, values) => pool.query(sql, values);
  return { pool, query };
}
