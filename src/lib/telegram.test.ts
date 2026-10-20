import { afterEach, expect, it, vi } from "vitest";
import { initializeTelegram } from "./telegram";

afterEach(() => { vi.unstubAllGlobals(); });

it("syncs Telegram theme changes and removes stale colors without accepting malformed values", () => {
  const properties = new Map<string, string>();
  const root = { dataset: {} as Record<string, string>, style: { setProperty: (key: string, value: string) => properties.set(key, value), removeProperty: (key: string) => properties.delete(key) } };
  let changed = () => {};
  const app = { initData: "launch", colorScheme: "dark", themeParams: { button_color: "#5cbbf6", secondary_bg_color: "#17212b" } as Record<string, string>,
    ready: vi.fn(), expand: vi.fn(), isVersionAtLeast: () => true, setHeaderColor: vi.fn(), setBackgroundColor: vi.fn(), setBottomBarColor: vi.fn(),
    onEvent: vi.fn((_event: string, callback: () => void) => { changed = callback; }), offEvent: vi.fn() };
  vi.stubGlobal("document", { documentElement: root });
  vi.stubGlobal("window", { Telegram: { WebApp: app } });
  const cleanup = initializeTelegram();
  expect(root.dataset.telegramTheme).toBe("dark");
  expect(properties.get("--tg-theme-button-color")).toBe("#5cbbf6");
  expect(app.setHeaderColor).toHaveBeenCalledWith("#eeeae1");
  expect(app.setBackgroundColor).toHaveBeenCalledWith("#eeeae1");
  app.colorScheme = "light";
  app.themeParams = { secondary_bg_color: "invalid", button_color: "url(https://example.com)" };
  changed();
  expect(root.dataset.telegramTheme).toBe("light");
  expect(properties.has("--tg-theme-button-color")).toBe(false);
  expect(app.setBackgroundColor).toHaveBeenLastCalledWith("#eeeae1");
  expect(app.setBottomBarColor).toHaveBeenLastCalledWith("#eeeae1");
  cleanup?.();
  expect(app.offEvent).toHaveBeenCalledWith("themeChanged", changed);
});

it("leaves normal browser appearance alone and supports older Telegram clients", () => {
  vi.stubGlobal("window", {});
  expect(initializeTelegram()).toBeUndefined();
  const root = { dataset: {}, style: { setProperty: vi.fn(), removeProperty: vi.fn() } };
  const app = { initData: "launch", ready: vi.fn(), expand: vi.fn(), isVersionAtLeast: () => false, setHeaderColor: vi.fn(), setBackgroundColor: vi.fn() };
  vi.stubGlobal("document", { documentElement: root });
  vi.stubGlobal("window", { Telegram: { WebApp: app } });
  initializeTelegram();
  expect(app.ready).toHaveBeenCalledOnce();
  expect(app.setHeaderColor).not.toHaveBeenCalled();
  expect(app.setBackgroundColor).not.toHaveBeenCalled();
});
