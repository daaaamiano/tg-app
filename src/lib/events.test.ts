import { describe, expect, it } from "vitest";
import { demoEvent } from "../data/event";
import { eventCalendar, eventDate, eventTime, filterEvents } from "./events";

const event = demoEvent.events[0];

describe("event browsing", () => {
  it("shows the only announced event before it ends and leaves the archive empty", () => {
    const now = new Date("2026-10-07T12:00:00Z");
    expect(filterEvents(demoEvent.events, "upcoming", now)).toEqual([event]);
    expect(filterEvents(demoEvent.events, "past", now)).toEqual([]);
  });

  it("keeps a running jam upcoming, then archives it at its actual end", () => {
    expect(
      filterEvents([event], "upcoming", new Date("2026-10-16T18:00:00Z"))
    ).toEqual([event]);
    expect(
      filterEvents([event], "past", new Date("2026-10-16T19:00:00Z"))
    ).toEqual([event]);
    expect(
      filterEvents([event], "upcoming", new Date("2026-10-16T19:00:00Z"))
    ).toEqual([]);
  });

  it("sorts future events chronologically and past events newest first", () => {
    const later = {
      ...event,
      id: "later",
      startsAt: "2026-11-16T19:00:00+01:00",
      endsAt: "2026-11-16T21:00:00+01:00",
    };
    expect(
      filterEvents([later, event], "upcoming", new Date("2026-10-07"))
    ).toEqual([event, later]);
    expect(
      filterEvents([event, later], "past", new Date("2026-12-01"))
    ).toEqual([later, event]);
  });

  it("formats the event in Barcelona time rather than the viewer's time zone", () => {
    expect(eventDate(event)).toBe("Friday, 16 October 2026");
    expect(eventTime(event)).toBe("19:00");
    expect(eventTime(event, event.arrivalFrom)).toBe("18:30");
    expect(eventTime(event, event.endsAt)).toBe("21:00");
  });
});

describe("calendar export", () => {
  it("exports the real event times in UTC with venue text and a stable UID", () => {
    const calendar = eventCalendar(event, new Date("2026-10-07T10:00:00Z"));
    const unfolded = calendar.replace(/\r\n /g, "");
    expect(unfolded).toContain("DTSTART:20261016T170000Z");
    expect(unfolded).toContain("DTEND:20261016T190000Z");
    expect(unfolded).toContain(
      "LOCATION:LabCultural\\, Carrer del Rector Triadó\\, 11\\, Sants\\, Barcelona"
    );
    expect(unfolded).toContain(`UID:${event.id}@private-rope-jam`);
    expect(unfolded).toContain("18:30");
    expect(unfolded).toContain("not a booking");
    for (const line of calendar.split("\r\n"))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
});
