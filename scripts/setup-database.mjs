import pg from "pg";
import { readFile } from "node:fs/promises";

if (!process.env.DATABASE_URL) throw new Error("Set the private DATABASE_URL before running npm run db:setup.");
const url = new URL(process.env.DATABASE_URL);
if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname) throw new Error("Use a PostgreSQL connection URL.");
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) url.searchParams.set("sslmode", "verify-full");
const pool = new pg.Pool({ connectionString: url.toString(), connectionTimeoutMillis: 8000 });
try {
  await pool.query(await readFile(new URL("../server/schema.sql", import.meta.url), "utf8"));
  console.log("Single database initialized for sessions, login challenges, and group approvals.");
} catch { throw new Error("Database setup failed. Check the private connection URL and database permissions."); }
finally { await pool.end(); }
