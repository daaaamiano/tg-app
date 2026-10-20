import type { ReactNode } from "react";
import { CalendarDays, Map, MapPin, ShieldCheck, Ticket } from "lucide-react";
import { InstagramIcon } from "./InstagramIcon";
import type { RopeEvent } from "../types/event";
import { eventDate, eventTime, mapsUrl } from "../lib/events";

export function EventHeading({ event }: { event: RopeEvent }) {
  const date = new Date(event.startsAt);
  const format = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { ...options, timeZone: event.timeZone }).format(date);
  return <div className="event-heading">
    <div className="date-sticker" aria-hidden="true"><span>{format({ month: "short" })}</span><strong>{format({ day: "numeric" })}</strong></div>
    <div><h1>{event.name}</h1><p>Shibari practice · {event.city}</p></div>
  </div>;
}

export function EventDetails({ event, isPast, responseBox, showHeading, onCalendar, onRules }: {
  event: RopeEvent; isPast: boolean; responseBox?: ReactNode; showHeading: boolean;
  onCalendar: () => void; onRules: () => void;
}) {
  return <section className="event-details" aria-label="Event details">
    {showHeading && <EventHeading event={event} />}
    <div className="event-facts">
      <div className="event-fact"><CalendarDays size={20} /><div><h2><time dateTime={event.startsAt}>{new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: event.timeZone }).format(new Date(event.startsAt))}</time></h2><p>{eventTime(event)}–{eventTime(event, event.endsAt)} · Doors at {eventTime(event, event.arrivalFrom)}</p><small>Barcelona time</small></div></div>
      <div className="event-fact"><MapPin size={20} /><div>
        <div className="venue-heading"><h2>{event.venue}</h2><div className="venue-links">
          <a href={mapsUrl(event)} target="_blank" rel="noreferrer" aria-label={`Open ${event.venue} in Google Maps`} title="Google Maps"><Map size={18} aria-hidden="true" /></a>
          {event.venueInstagramUrl && <a href={event.venueInstagramUrl} target="_blank" rel="noreferrer" aria-label={`${event.venue} on Instagram`} title="Instagram"><InstagramIcon /></a>}
        </div></div>
        <p>{event.address}</p><small>{event.neighborhood}, {event.city}</small>
      </div></div>
      <div className="event-fact"><Ticket size={20} /><div><h2>{new Intl.NumberFormat("en-GB", { style: "currency", currency: event.currency }).format(event.price)} per person</h2><p>{event.capacity} people max{event.inviteOnly ? " · Invite only" : ""}</p></div></div>
    </div>
    {responseBox}
    <div className="event-actions">
      {!isPast && <button className="outline-button" onClick={onCalendar}><CalendarDays size={17} /> Add to calendar</button>}
      <button className="text-link" onClick={onRules}><ShieldCheck size={17} /> House rules</button>
    </div>
    <p className="event-note">{event.suspensionPoints === 1 ? "One suspension point." : `${event.suspensionPoints} suspension points.`} Ask the host before use. No uninvited guests.</p>
    <details className="event-poster-details"><summary>Event poster</summary><img src={event.poster} alt={`${event.name} invitation: ${eventDate(event)}, ${eventTime(event)}–${eventTime(event, event.endsAt)}, ${event.venue}`} /></details>
  </section>;
}
