import { afterEach, expect, it, vi } from "vitest";
import { eventCatalog } from "../src/data/eventCatalog";
import { attendanceMessage, sendAttendanceNotification } from "./attendanceNotification";

afterEach(() => vi.unstubAllGlobals());

it("uses the event's local time and location for Going and Pending, and confirms Not going briefly", () => {
  const event = eventCatalog[0];
  expect(attendanceMessage(event, "going")).toBe("Private Rope Jam: Going confirmed.\n16 Oct, 19:00–21:00 (Barcelona).\nLabCultural, Carrer del Rector Triadó, 11.");
  expect(attendanceMessage(event, "pending")).toContain("Pending — decide later.\n16 Oct, 19:00–21:00");
  expect(attendanceMessage(event, "not-going")).toBe("Private Rope Jam: Not going. Your response is saved.");
});

it("sends a private message to the verified user, without formatting untrusted event text", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  vi.stubGlobal("fetch", fetcher);
  expect(await sendAttendanceNotification("123:test", 234, eventCatalog[0], "going")).toBe(true);
  const [url, options] = fetcher.mock.calls[0];
  expect(url).toBe("https://api.telegram.org/bot123:test/sendMessage");
  expect(JSON.parse(options.body)).toEqual({ chat_id: 234, text: attendanceMessage(eventCatalog[0], "going") });
  expect(options.signal).toBeInstanceOf(AbortSignal);
});

it("reports blocked chats, Telegram errors, and network failures without throwing", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response('{"ok":false}', { status: 403 }))
    .mockResolvedValueOnce(new Response('{"ok":false}', { status: 200 }))
    .mockRejectedValueOnce(new Error("Network unavailable"));
  vi.stubGlobal("fetch", fetcher);
  for (const response of ["going", "not-going", "pending"] as const)
    expect(await sendAttendanceNotification("123:test", 234, eventCatalog[0], response)).toBe(false);
  expect(await sendAttendanceNotification("123:test", -123, eventCatalog[0], "going")).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(3);
});
