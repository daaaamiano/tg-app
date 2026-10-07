import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("event and Telegram API boundary", () => {
  it("loads demo data without a network request by default", async () => {
    vi.stubEnv("VITE_DATA_SOURCE", "mock");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { getEvent } = await import("./api");
    const event = await getEvent();
    expect(event.events.length).toBeGreaterThan(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fails explicitly when API mode has no base URL", async () => {
    vi.stubEnv("VITE_DATA_SOURCE", "api");
    vi.stubEnv("VITE_API_BASE_URL", "");
    const { getEvent } = await import("./api");
    await expect(getEvent()).rejects.toThrow("VITE_API_BASE_URL");
  });

  it("sends raw launch data to the backend and uses the returned identity", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com/");
    const user = { id: 123, first_name: "Server-verified user" };
    const fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ user }) });
    vi.stubGlobal("fetch", fetch);
    const { authenticateTelegram } = await import("./api");
    expect(await authenticateTelegram("signed-launch-data")).toEqual({ user });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.com/auth/telegram",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ initData: "signed-launch-data" }),
      })
    );
  });

  it("does not silently fall back to demo data on an API failure", async () => {
    vi.stubEnv("VITE_DATA_SOURCE", "api");
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503 })
    );
    const { getEvent } = await import("./api");
    await expect(getEvent()).rejects.toThrow("503");
  });
});
