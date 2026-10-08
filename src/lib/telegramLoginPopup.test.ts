import { afterEach, describe, expect, it, vi } from "vitest";
import { openTelegramLogin } from "./telegramLoginPopup";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

function browser(blocked = false) {
  vi.useFakeTimers();
  const popup = { closed: false, close: vi.fn() };
  let listener: ((event: MessageEvent) => void) | undefined;
  const open = vi.fn().mockReturnValue(blocked ? null : popup);
  const removeEventListener = vi.fn();
  vi.stubGlobal("window", {
    location: { origin: "https://private.example", pathname: "/" }, open,
    addEventListener: (_name: string, receive: (event: MessageEvent) => void) => { listener = receive; },
    removeEventListener,
  });
  const send = (origin: string, source: unknown, data: unknown) => listener!({ origin, source, data } as MessageEvent);
  return { popup, open, removeEventListener, send };
}

describe("Telegram popup login", () => {
  it("includes the required origin and nonce and accepts tokens only from its Telegram popup", () => {
    const { popup, open, send, removeEventListener } = browser();
    const result = vi.fn();
    openTelegramLogin({ clientId: 123456789, nonce: "one-use-test-nonce" }, result);
    const url = new URL(open.mock.calls[0][0]);
    expect(url.origin).toBe("https://oauth.telegram.org");
    expect(url.searchParams.get("origin")).toBe("https://private.example");
    expect(url.searchParams.get("redirect_uri")).toBe("https://private.example/");
    expect(url.searchParams.get("nonce")).toBe("one-use-test-nonce");
    const payload = { event: "auth_result", result: "test-token-still-needs-server-verification" };
    send("https://attacker.example", popup, payload);
    send("https://oauth.telegram.org", {}, payload);
    send("https://oauth.telegram.org", popup, "malformed-json");
    expect(result).not.toHaveBeenCalled();
    send("https://oauth.telegram.org", popup, JSON.stringify(payload));
    send("https://oauth.telegram.org", popup, payload);
    expect(result).toHaveBeenCalledTimes(1);
    expect(result).toHaveBeenCalledWith({ id_token: payload.result });
    expect(removeEventListener).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports blocked and closed popups so sign-in can be retried", () => {
    browser(true);
    const blocked = vi.fn();
    openTelegramLogin({ clientId: 123, nonce: "test" }, blocked);
    expect(blocked.mock.calls[0][0].error).toContain("Allow popups");
    const { popup } = browser();
    const closed = vi.fn();
    openTelegramLogin({ clientId: 123, nonce: "test" }, closed);
    popup.closed = true;
    vi.advanceTimersByTime(250);
    expect(closed.mock.calls[0][0].error).toContain("cancelled");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cleans up abandoned sign-ins without delivering a later result", () => {
    const { popup, send } = browser();
    const result = vi.fn();
    const cancel = openTelegramLogin({ clientId: 123, nonce: "test" }, result);
    cancel();
    send("https://oauth.telegram.org", popup, { event: "auth_result", result: "test" });
    expect(result).not.toHaveBeenCalled();
    expect(popup.close).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
