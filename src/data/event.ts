import type { EventData } from "../types/event";

// The only announced event. Add future/past events here until the event API is connected.
export const demoEvent: EventData = {
  events: [
    {
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
      address: "Carrer del Rector Triadó, 11",
      neighborhood: "Sants",
      city: "Barcelona",
      poster: `${import.meta.env.BASE_URL}private-rope-jam-poster.jpg`,
      suspensionPoints: 1,
      inviteOnly: true,
    },
  ],
};

export const houseRules = [
  {
    title: "Consent, always.",
    text: "Ask before touching a body, rope, or someone’s gear. Consent is specific, ongoing, and can be withdrawn at any time. No pressure, no explanations owed.",
  },
  {
    title: "Your name. Your pronouns.",
    text: "Respect names, pronouns, identities, and boundaries. Don’t assume someone’s gender, orientation, role, or who they want to tie with.",
  },
  {
    title: "Keep the room private.",
    text: "No photos or videos without authorization. No uninvited guests.",
  },
  {
    title: "No room for discrimination.",
    text: "No racism, sexism, homophobia, transphobia, ableism, body shaming, or harassment. If something feels wrong, tell the host.",
  },
  {
    title: "Only yes means yes.",
    text: "Agree on boundaries and stop signals before starting. Stop immediately when asked. Watching, taking a break, or choosing not to tie is always welcome.",
  },
  {
    title: "Be present. Share the space.",
    text: "Adults 18+ only. No intoxication. Ask the host before using the suspension point, stay within your experience, and make room for others.",
  },
];
