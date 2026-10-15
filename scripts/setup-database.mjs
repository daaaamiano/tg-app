import pg from "pg";
import { readFile } from "node:fs/promises";

if (!process.env.DATABASE_URL_UNPOOLED && !process.env.DATABASE_URL) throw new Error("Set the private direct DATABASE_URL_UNPOOLED before running npm run db:setup.");
const url = new URL(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL);
if (url.hostname.includes("-pooler")) throw new Error("Use DATABASE_URL_UNPOOLED for schema setup.");
if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname) throw new Error("Use a PostgreSQL connection URL.");
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) url.searchParams.set("sslmode", "verify-full");
const pool = new pg.Pool({ connectionString: url.toString(), connectionTimeoutMillis: 8000 });
try {
  await pool.query(await readFile(new URL("../server/schema.sql", import.meta.url), "utf8"));
  console.log("Database initialized for sessions, group access, event groups, event responses, and house rules agreements.");
} catch { throw new Error("Database setup failed. Check the private connection URL and database permissions."); }
finally { await pool.end(); }
