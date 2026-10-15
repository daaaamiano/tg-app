import type { RopeEvent } from "../src/types/event";
import type { AttendanceResponse } from "../src/types/attendance";

export type AttendanceNotifier = (token: string, userId: number, event: RopeEvent, response: AttendanceResponse) => Promise<boolean>;

export function attendanceMessage(event: RopeEvent, response: AttendanceResponse): string {
  if (response === "not-going") return `${event.name}: Not going. Your response is saved.`;
  const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: event.timeZone }).format(new Date(event.startsAt));
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: event.timeZone });
  const status = response === "going" ? "Going confirmed" : "Pending — decide later";
  return `${event.name}: ${status}.\n${date}, ${time.format(new Date(event.startsAt))}–${time.format(new Date(event.endsAt))} (${event.city}).\n${event.venue}, ${event.address}.`;
}

export const sendAttendanceNotification: AttendanceNotifier = async (token, userId, event, response) => {
  if (!Number.isSafeInteger(userId) || userId <= 0) return false;
  try {
    const result = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: userId, text: attendanceMessage(event, response) }),
      signal: AbortSignal.timeout(5000),
    });
    const body = await result.json() as { ok?: boolean };
    return result.ok && body.ok === true;
  } catch {
    // Delivery failure must not roll back a saved RSVP or expose the bot token.
    return false;
  }
};
