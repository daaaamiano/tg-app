import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Clock3, RefreshCw } from "lucide-react";
import { organizationRequest, OrganizationRequestError } from "../lib/organization";
import { eventDate } from "../lib/events";
import { getTelegram } from "../lib/telegram";
import { HouseRules } from "./HouseRules";
import { houseRulesVersion, isCompleteRulesAcceptance } from "../data/houseRules";
import type { AuthSession, RopeEvent } from "../types/event";
import type { EventAttendance, AttendanceResponse } from "../types/attendance";

export type EventSection = "event" | "people";
const labels: Record<AttendanceResponse, string> = { going: "Going", "not-going": "Not going", pending: "Pending" };

export function EventParticipation({ event, user, organizer, preview, section, onSection, onAccessChanged, confirmingRules = false, onRulesRequired, onRulesBack, onRulesConfirmed, children }: {
  event: RopeEvent; user: AuthSession["user"]; organizer: boolean; preview: boolean;
  section: EventSection; onSection: (section: EventSection) => void; onAccessChanged: () => void;
  children: (responseBox: ReactNode) => ReactNode;
  confirmingRules?: boolean; onRulesRequired: () => void; onRulesBack: () => void; onRulesConfirmed: () => void;
}) {
  const [attendance, setAttendance] = useState<EventAttendance | null>(null);
  const [error, setError] = useState("");
  const [notificationNotice, setNotificationNotice] = useState("");
  const writeAccessRequest = useRef<Promise<void> | null>(null);
  const saveInFlight = useRef(false);
  const replyVersion = useRef(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rulesConfirmed, setRulesConfirmed] = useState(false);
  const rulesConfirmedCallback = useRef(onRulesConfirmed);
  const [filter, setFilter] = useState<AttendanceResponse>("going");
  const [version, setVersion] = useState(0);
  const request = useRef<AbortController | null>(null);
  const current = useRef(true);
  const storageKey = `ropelab-preview-response:${event.id}:${user.id}`;
  const rulesStorageKey = `ropelab-preview-rules:${user.id}`;
  const past = new Date(event.endsAt).getTime() <= Date.now();

  useEffect(() => { rulesConfirmedCallback.current = onRulesConfirmed; }, [onRulesConfirmed]);
  useEffect(() => {
    if (!confirmingRules) { setRulesConfirmed(false); return; }
    if (!rulesConfirmed) return;
    const timer = window.setTimeout(() => rulesConfirmedCallback.current(), 1000);
    return () => window.clearTimeout(timer);
  }, [rulesConfirmed, confirmingRules]);

  function previewAttendance(response: AttendanceResponse): EventAttendance {
    return {
      eventId: event.id, response, canRespond: true, rules: { version: houseRulesVersion, accepted: false }, groups: [{ chatId: "preview", title: "Preview group" }],
      people: response === "going" ? [{ userId: String(user.id), name: user.first_name, response }] : [], complete: true,
    };
  }

  useEffect(() => {
    current.current = true;
    const refresh = () => { if (!saveInFlight.current) setVersion(value => value + 1); };
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 60000);
    return () => { current.current = false; request.current?.abort(); window.removeEventListener("focus", refresh); window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (saveInFlight.current) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true); setError("");
    if (preview) {
      let saved: string | null = null;
      try { saved = localStorage.getItem(storageKey); } catch { /* Browser storage may be disabled. */ }
      const result = previewAttendance(saved === "going" || saved === "not-going" ? saved : "pending");
      try { result.rules.accepted = localStorage.getItem(rulesStorageKey) === houseRulesVersion; } catch { /* Browser storage may be disabled. */ }
      setAttendance(result);
      setLoading(false);
      return () => controller.abort();
    }
    organizationRequest<EventAttendance>(`attendance?eventId=${encodeURIComponent(event.id)}`, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setAttendance(result); })
      .catch(cause => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "The invitation could not be loaded.");
        if (cause instanceof OrganizationRequestError && [401, 403].includes(cause.status)) { setAttendance(null); onAccessChanged(); }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [event.id, user.id, preview, version]);

  async function notify(response: AttendanceResponse, revision: number) {
    const telegram = getTelegram();
    if (telegram?.initData && telegram.isVersionAtLeast("6.9") && telegram.requestWriteAccess && !telegram.initDataUnsafe.user?.allows_write_to_pm) {
      writeAccessRequest.current ??= new Promise<void>(resolve => {
        const timer = window.setTimeout(resolve, 8000);
        const finish = () => { window.clearTimeout(timer); resolve(); };
        try { telegram.requestWriteAccess!(finish); } catch { finish(); }
      });
      await writeAccessRequest.current;
    }
    if (!current.current || revision !== replyVersion.current) return;
    let delivered = false;
    try {
      const result = await organizationRequest<{ notificationSent: boolean }>("rsvp-notification", {
        method: "POST", body: JSON.stringify({ eventId: event.id, response }),
      });
      delivered = result.notificationSent;
    } catch { /* Notification failure never changes the saved response. */ }
    if (current.current && revision === replyVersion.current && !delivered)
      setNotificationNotice("Response saved. Bot message could not be delivered. Open the bot chat and allow messages.");
  }

  async function reply(response: AttendanceResponse, rulesVersion?: string, acceptedRuleIds?: string[]) {
    if (saveInFlight.current || rulesConfirmed || !attendance?.canRespond || past) return;
    if (rulesVersion && !isCompleteRulesAcceptance(acceptedRuleIds)) return;
    if (response === "going" && !rulesVersion) {
      setError("");
      onRulesRequired();
      return;
    }
    saveInFlight.current = true;
    const revision = ++replyVersion.current;
    // Invalidate any older attendance read before beginning the mutation.
    request.current?.abort();
    setLoading(false);
    setSaving(true); setError(""); setNotificationNotice("");
    try {
      if (preview) {
        try {
          localStorage.setItem(storageKey, response);
          if (rulesVersion) localStorage.setItem(rulesStorageKey, rulesVersion);
        } catch { /* Response remains usable for this visit. */ }
        setAttendance({ ...previewAttendance(response), rules: { version: houseRulesVersion, accepted: Boolean(rulesVersion) || attendance.rules.accepted } });
      } else {
        await organizationRequest("rsvp", { method: "POST", body: JSON.stringify({ eventId: event.id, response, deferNotification: true, rulesVersion, acceptedRuleIds }) });
        if (!current.current) return;
        // Update only after the server saves the response; refresh the complete People list next.
        setAttendance(previous => previous && {
          ...previous, response, rules: { ...previous.rules, accepted: Boolean(rulesVersion) || previous.rules.accepted },
          people: [...previous.people.filter(person => person.userId !== String(user.id)),
            ...(response === "going" || organizer ? [{ userId: String(user.id), name: [user.first_name, user.last_name].filter(Boolean).join(" "), response }] : [])],
        });
        setVersion(value => value + 1);
        void notify(response, revision);
      }
      if (rulesVersion) setRulesConfirmed(true);
    } catch (cause) {
      if (!current.current) return;
      if (cause instanceof OrganizationRequestError && cause.status === 428 && response === "going" && !rulesVersion) {
        setAttendance(previous => previous && { ...previous, rules: { ...previous.rules, accepted: false } });
        onRulesRequired();
        return;
      }
      setError(cause instanceof Error ? cause.message : "Your response could not be saved. Please try again.");
      if (cause instanceof OrganizationRequestError && [401, 403].includes(cause.status)) { setAttendance(null); onAccessChanged(); }
    } finally { saveInFlight.current = false; if (current.current) setSaving(false); }
  }

  const going = attendance?.people.filter(person => person.response === "going").length ?? 0;
  const response = attendance?.response;
  const people = attendance?.people.filter(person => person.response === (organizer ? filter : "going")) ?? [];

  if (confirmingRules) return <HouseRules key={event.id} confirmation={{ event, saving, confirmed: rulesConfirmed, alreadyAgreed: attendance?.rules.accepted === true, unavailable: !attendance || !attendance.canRespond || past, error: error || (past ? "This event has ended. Responses are closed." : ""),
    onConfirm: acceptedRuleIds => void reply("going", houseRulesVersion, acceptedRuleIds), onBack: onRulesBack }} />;

  return <section className="event-participation" aria-label="Event invitation and attendance">
    <div className="events-tabs participation-tabs" role="group" aria-label="Event sections">
      <button className={section === "event" ? "selected" : ""} aria-pressed={section === "event"} onClick={() => onSection("event")}>Event</button>
      <button className={section === "people" ? "selected" : ""} aria-pressed={section === "people"} onClick={() => onSection("people")}>People {attendance && <span>{going}</span>}</button>
    </div>
    {preview && <p className="participation-preview">Preview · Responses are saved only in this browser.</p>}
    {error && <div className="participation-error"><p className="error-message" role="alert">{error}</p><button className="text-link" onClick={() => setVersion(value => value + 1)} disabled={loading}><RefreshCw size={14} /> Retry</button></div>}
    {section === "event" && children(
      <section className="event-rsvp" aria-label="Your attendance response">
        <div className="event-rsvp-heading">
          <h2>Are you coming?</h2>
          <span className={`attendance-badge ${response === "going" ? "attendance-confirmed" : ""}`}>
            {response === "going" ? <><Check size={13} /> Going</> : response === "pending" ? "No response" : response ? labels[response] : loading ? "Loading…" : organizer ? "Organizer" : "Invitation"}
          </span>
        </div>
        {loading && !attendance && <p role="status" className="participation-loading">Loading your response…</p>}
        {attendance?.canRespond ? <div className="invitation-response">
          <div className="invitation-response-buttons" role="group" aria-label="Your attendance response">
            <button className="primary-button" aria-pressed={response === "going"} disabled={saving || past} onClick={() => void reply("going")}><Check size={15} /> Going</button>
            <button className={response === "not-going" ? "primary-button" : "outline-button"} aria-pressed={response === "not-going"} disabled={saving || past} onClick={() => void reply("not-going")}>Not going</button>
            <button className="text-link" aria-pressed={response === "pending"} disabled={saving || past} onClick={() => void reply("pending")}><Clock3 size={14} /> Decide later</button>
          </div>
          {response === "going" && !past && !attendance.rules.accepted && <p className="invitation-feedback">
            Please confirm our house rules before attending. <button className="text-link" disabled={saving} onClick={onRulesRequired}>Read & confirm house rules</button>
          </p>}
          {(saving || past) && <p className="invitation-feedback" role="status" aria-live="polite">{saving ? "Saving your response…" : `This event has ended. Your response: ${response ? labels[response] : "Pending"}.`}</p>}
        </div> : attendance && <p className="invitation-feedback">Group membership is required to respond.</p>}
        {attendance?.groups.length ? <p className="invitation-feedback">Invited through {attendance.groups.map(group => group.title).join(", ")}</p> : null}
        {notificationNotice && <p className="invitation-feedback" role="status">{notificationNotice}</p>}
      </section>
    )}
    {section === "people" && <section className="event-people" aria-labelledby="event-people-title">
      <div className="people-heading"><h2 id="event-people-title">People</h2><button className="text-link" disabled={loading || saving} onClick={() => setVersion(value => value + 1)}><RefreshCw size={14} /> Refresh</button></div>
      <p>{organizer ? "Only Going counts as confirmed attendance." : "Only confirmed attendees are listed."}</p>
      {attendance?.notice && <p className="member-notice" role="status">{attendance.notice}</p>}
      {organizer && <div className="events-tabs people-filters" role="group" aria-label="Filter attendance responses">{(["going", "pending", "not-going"] as const).map(state => <button key={state} className={filter === state ? "selected" : ""} aria-pressed={filter === state} onClick={() => setFilter(state)}>{state === "pending" && attendance?.complete === false ? "Known pending" : labels[state]}<span>{attendance?.people.filter(person => person.response === state).length ?? 0}</span></button>)}</div>}
      <ul className="event-people-list" aria-live="polite">{people.map(person => <li key={person.userId}><span className="person-initial">{person.name.slice(0, 1).toUpperCase()}</span><span>{person.name}{person.userId === String(user.id) && <small> (you)</small>}</span><span className={`attendance-badge ${person.response === "going" ? "attendance-confirmed" : ""}`}>{person.response === "going" ? "Confirmed" : labels[person.response]}</span></li>)}</ul>
      {!loading && !error && attendance && people.length === 0 && <p className="people-empty">{filter === "going" || !organizer ? "No confirmed attendees yet." : filter === "pending" ? "No pending invitations in the available member list." : "No Not going responses."}</p>}
    </section>}
  </section>;
}
