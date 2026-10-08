import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import type { TelegramConfig } from "./telegramMembers";

export interface TelegramServerConfig extends TelegramConfig { loginClientId: string }

export function telegramConfigFromEnv(env: Record<string, string | undefined>): TelegramServerConfig {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.TELEGRAM_GROUP_ID?.trim();
  if (!token || !/^\d+:[^\s]+$/.test(token)) throw new Error("Configure TELEGRAM_BOT_TOKEN in private server settings.");
  if (!chatId || !/^-\d+$/.test(chatId)) throw new Error("Configure TELEGRAM_GROUP_ID in private server settings.");
  const apiId = Number(env.TELEGRAM_API_ID);
  const loginClientId = env.TELEGRAM_LOGIN_CLIENT_ID?.trim() || token.split(":")[0];
  if (!/^\d+$/.test(loginClientId) || !Number.isSafeInteger(Number(loginClientId)))
    throw new Error("Configure TELEGRAM_LOGIN_CLIENT_ID in private server settings.");
  return { token, chatId, apiId: Number.isSafeInteger(apiId) && apiId > 0 ? apiId : undefined,
    apiHash: env.TELEGRAM_API_HASH?.trim() || undefined, loginClientId };
}

export function readTelegramConfig(root: string, production = process.env.NODE_ENV === "production"): TelegramServerConfig {
  let file: Record<string, string | undefined> = {};
  if (!production) {
    try { file = parseEnv(readFileSync(resolve(root, ".env.server.local"), "utf8")); } catch { /* missing settings are reported without values */ }
  }
  return telegramConfigFromEnv({ ...file, ...process.env });
}

export function serviceOrigin(value: string | undefined, production: boolean): string {
  if (!value) throw new Error("Set APP_ORIGIN to the service's exact public origin.");
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("APP_ORIGIN must be an HTTP origin."); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      (production ? url.protocol !== "https:" : !["http:", "https:"].includes(url.protocol)))
    throw new Error("APP_ORIGIN must be an exact origin; production requires HTTPS.");
  if (!production && url.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw new Error("HTTP testing is available only on loopback.");
  return url.origin;
}
