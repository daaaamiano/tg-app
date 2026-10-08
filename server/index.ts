import { resolve } from "node:path";
import { readTelegramConfig, serviceOrigin } from "./telegramConfig";
import { createPrivateService, validatePrivateBuild } from "./privateService";
import { databaseFromEnv } from "./database";
import { createDatabaseAuthStorage } from "./authStorage";
import { createDatabaseGroupStore, createGroupAccess } from "./groupAccess";

const production = process.env.NODE_ENV === "production";
const root = process.cwd();
const port = Number(process.env.PORT ?? 5180);
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be a valid port number.");
const origin = serviceOrigin(process.env.APP_ORIGIN ?? (production ? undefined : `http://127.0.0.1:${port}`), production);
const dist = resolve(root, "dist");
validatePrivateBuild(dist);
const database = production || process.env.DATABASE_URL ? databaseFromEnv(process.env) : undefined;
const storage = database ? createDatabaseAuthStorage(database.query, origin) : {};
const config = readTelegramConfig(root, production);
const groups = database ? createGroupAccess(createDatabaseGroupStore(database.query), () => config) : undefined;
const app = createPrivateService({ origin, dist, config, groups, secureCookies: origin.startsWith("https:"), ...storage });
const server = app.listen(port, production ? "0.0.0.0" : "127.0.0.1", () => {
  console.log(`Private app listening on port ${port}; configured origin: ${origin}`);
});
server.requestTimeout = 20000;
server.headersTimeout = 10000;
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => {
  server.close(async () => { await database?.pool.end(); process.exit(0); });
  setTimeout(() => process.exit(1), 10000).unref();
});
