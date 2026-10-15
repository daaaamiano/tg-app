import type { EventData } from "../types/event";
import { eventCatalog } from "./eventCatalog";

// The only announced event. Add future/past events here until the event API is connected.
export const demoEvent: EventData = {
  events: eventCatalog.map(event => ({ ...event, poster: `${import.meta.env.BASE_URL}${event.poster.slice(1)}` })),
};

export { houseRules } from "./houseRules";
