import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";
import { createPrivateService, validatePrivateBuild } from "./privateService";
import { readTelegramConfig, serviceOrigin } from "./telegramConfig";
import { createDatabaseAuthStorage } from "./authStorage";
import { databaseFromEnv } from "./database";
import { createDatabaseGroupStore, createGroupAccess } from "./groupAccess";

let app: ReturnType<typeof createPrivateService> | undefined;

// Lazy setup allows builds without secrets. Missing runtime configuration fails closed.
export default function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    if (!app) {
      const origin = serviceOrigin(process.env.APP_ORIGIN, true);
      const dist = resolve(__dirname, "private");
      validatePrivateBuild(dist);
      const database = databaseFromEnv(process.env);
      const storage = createDatabaseAuthStorage(database.query, origin);
      const config = readTelegramConfig(process.cwd(), true);
      const groups = createGroupAccess(createDatabaseGroupStore(database.query), () => config);
      app = createPrivateService({ origin, dist, config, groups, secureCookies: true, ...storage });
    }
    return app(req, res);
  } catch {
    res.statusCode = 503;
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "The private service is not configured yet." }));
  }
}
