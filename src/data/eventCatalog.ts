import type { RopeEvent } from "../types/event";

// Event content is served by the authenticated API in private builds.
const octoberEvent: RopeEvent = {
  id: "private-rope-jam-2026-10-16",
  name: "Private Rope Jam",
  startsAt: "2026-10-16T19:00:00+02:00",
  endsAt: "2026-10-16T21:00:00+02:00",
  arrivalFrom: "2026-10-16T18:30:00+02:00",
  timeZone: "Europe/Madrid",
  price: 8.5,
  currency: "EUR",
  capacity: 10,
  venue: "LabCultural",
  venueInstagramUrl: "https://www.instagram.com/labcultural.barcelona/",
  address: "Carrer del Rector Triadó, 11",
  neighborhood: "Sants",
  city: "Barcelona",
  poster: "/private-rope-jam-poster.jpg",
  suspensionPoints: 1,
  inviteOnly: true,
};

export const eventCatalog: RopeEvent[] = [octoberEvent, {
  ...octoberEvent,
  id: "private-rope-jam-2026-11-15",
  // Barcelona is on CET in November; preserve the same local hours.
  startsAt: "2026-11-15T19:00:00+01:00",
  endsAt: "2026-11-15T21:00:00+01:00",
  arrivalFrom: "2026-11-15T18:30:00+01:00",
  poster: "/private-rope-jam-2026-11-15-poster.svg",
}];
