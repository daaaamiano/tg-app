import type { Plugin } from "vite";
import { loadGroupRoster } from "./telegramMembers";
import { readTelegramConfig, type TelegramServerConfig } from "./telegramConfig";
import { createTelegramMiddleware } from "./telegramMiddleware";

export { allowLocalRosterRequest } from "./telegramMiddleware";

export function createLocalTelegramMiddleware(configReader: () => TelegramServerConfig, rosterLoader = loadGroupRoster, base = "/") {
  return createTelegramMiddleware(configReader, {
    prefix: `${base}__local/telegram/`, cookiePath: base, localOnly: true, rosterLoader,
  });
}

// Development only: preserve loopback isolation even when the hosted service exists.
export function localTelegramPlugin(): Plugin {
  return {
    name: "local-telegram-roster", apply: "serve",
    configureServer(server) {
      server.middlewares.use(createLocalTelegramMiddleware(() => readTelegramConfig(server.config.root), loadGroupRoster, server.config.base));
    },
  };
}
