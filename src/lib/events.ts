import type { RopeEvent } from "../types/event";

export type EventPeriod = "upcoming" | "past";

export function filterEvents(
  events: RopeEvent[],
  period: EventPeriod,
  now = new Date()
): RopeEvent[] {
  return events
    .filter((event) =>
      period === "past"
        ? new Date(event.endsAt) <= now
        : new Date(event.endsAt) > now
    )
    .sort((a, b) =>
      period === "past"
        ? new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()
        : new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
    );
}

export function eventDate(event: RopeEvent, short = false): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: event.timeZone,
    day: "numeric",
    month: short ? "short" : "long",
    year: "numeric",
    ...(short ? {} : { weekday: "long" as const }),
  }).format(new Date(event.startsAt));
}

export function eventTime(event: RopeEvent, value = event.startsAt): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: event.timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function mapsUrl(event: RopeEvent): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${event.venue}, ${event.address}, ${event.city}`
  )}`;
}

function escapeCalendar(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

// Fold long calendar lines at 75 UTF-8 octets, preserving accented venue names.
function foldLine(line: string): string {
  const encoder = new TextEncoder();
  let result = "";
  let bytes = 0;
  for (const char of line) {
    const length = encoder.encode(char).length;
    if (bytes + length > 75) {
      result += "\r\n ";
      bytes = 1;
    }
    result += char;
    bytes += length;
  }
  return result;
}

export function eventCalendar(event: RopeEvent, now = new Date()): string {
  const stamp = (date: Date) =>
    date
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Private Rope Jam//Event//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${event.id}@private-rope-jam`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(new Date(event.startsAt))}`,
    `DTEND:${stamp(new Date(event.endsAt))}`,
    `SUMMARY:${escapeCalendar(event.name)}`,
    `LOCATION:${escapeCalendar(
      `${event.venue}, ${event.address}, ${event.neighborhood}, ${event.city}`
    )}`,
    `DESCRIPTION:${escapeCalendar(
      `Private, vetted group of ${event.capacity}. ${event.price.toFixed(
        2
      )}€. Arrive from ${eventTime(event, event.arrivalFrom)}; jam ${eventTime(
        event
      )}–${eventTime(
        event,
        event.endsAt
      )}. Friendly. This calendar entry is not a booking.`
    )}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ]
    .map(foldLine)
    .join("\r\n");
}

export function downloadCalendar(event: RopeEvent): void {
  const url = URL.createObjectURL(
    new Blob([eventCalendar(event)], { type: "text/calendar;charset=utf-8" })
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `${event.id}.ics`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}
