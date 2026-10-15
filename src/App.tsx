import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  Clock3,
  MapPin,
  Send,
  UserRound,
  X,
} from "lucide-react";
import { Modal } from "./components/Modal";
import { GroupApprovals } from "./components/GroupApprovals";
import { TelegramBrowserLogin } from "./components/TelegramBrowserLogin";
import { RopeParallax } from "./components/RopeParallax";
import { useWebAccount } from "./components/AppAuthProvider";
import { HouseRules } from "./components/HouseRules";
import {
  apiConfigured,
  authenticateTelegram,
  getEvent,
  logoutTelegram,
  usingMockData,
} from "./lib/api";
import {
  downloadCalendar,
  eventDate,
  eventTime,
  filterEvents,
  mapsUrl,
  type EventPeriod,
} from "./lib/events";
import {
  getTelegram,
  haptic,
  isInTelegram,
  telegramLaunchUrl,
} from "./lib/telegram";
import type { AuthSession, EventData, RopeEvent } from "./types/event";
import { isLoginPath } from "./lib/paths";
import { useOrganizationAccount } from "./lib/useOrganizationAccount";
import { organizationAuthAvailable, privateServiceMode } from "./lib/organization";
import { accessDeniedCopy } from "./lib/accessCopy";
import { EventParticipation, type EventSection } from "./components/EventParticipation";

type View = "event" | "events" | "groups" | "rules";

function viewFromHash(): View {
  switch (window.location.hash) {
    case "#organization": return "groups";
    case "#events": return "events";
    case "#house-rules": return "rules";
    default: return "event";
  }
}

function RopeMark() {
  return (
    <svg
      width="30"
      height="39"
      viewBox="0 0 30 39"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M9-3C24 6 0 10 14 19S1 31 11 42M22-3C4 10 32 14 19 23S31 34 21 42"
        stroke="currentColor"
        strokeWidth="2.2"
      />
      <path
        d="M8 18C10 13 21 14 23 20S11 27 8 21"
        stroke="currentColor"
        strokeWidth="2.2"
      />
    </svg>
  );
}

export default function App() {
  const [data, setData] = useState<EventData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [view, setView] = useState<View>(viewFromHash);
  const [period, setPeriod] = useState<EventPeriod>("upcoming");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAccount, setShowAccount] = useState(
    () => isLoginPath(window.location.pathname)
  );
  const [localAuth, setLocalAuth] = useState<AuthSession | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [eventSection, setEventSection] = useState<EventSection>("event");
  const [rulesEventId, setRulesEventId] = useState<string | null>(null);
  const [eventVersion, setEventVersion] = useState(0);
  const webAccount = useWebAccount();
  const organization = useOrganizationAccount();
  const auth: AuthSession | null = organization.session
    ? { user: organization.session.user, mode: "verified" }
    : webAccount.session ?? localAuth;
  const isSystemAdmin = organization.session?.isSystemAdmin === true;
  const canViewEvents = isSystemAdmin || organization.session?.canViewEvents === true;
  const inTelegram = isInTelegram();
  const allEvents = data?.events ?? [];
  const visibleEvents = filterEvents(allEvents, period, now);
  const event =
    allEvents.find((item) => item.id === selectedId) ??
    filterEvents(allEvents, "upcoming", now)[0] ??
    filterEvents(allEvents, "past", now)[0];
  const isPast = event ? new Date(event.endsAt) <= now : false;
  const previewParticipation = !privateServiceMode && !organization.session && (auth?.mode === "demo" || auth?.mode === "telegram-preview");
  const showParticipation = Boolean(organization.session || previewParticipation);
  const confirmingRules = view === "rules" && rulesEventId === event?.id && showParticipation && Boolean(auth);

  function load() {
    setEventVersion(version => version + 1);
  }
  useEffect(() => {
    setData(null); setLoadError("");
    if (privateServiceMode && !canViewEvents) { setData(null); return; }
    const controller = new AbortController();
    getEvent(Boolean(organization.session), controller.signal)
      .then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(error => { if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "The events could not be loaded."); });
    return () => controller.abort();
  }, [canViewEvents, organization.session?.user.id, eventVersion]);
  useEffect(() => {
    const changeView = () => {
      const next = viewFromHash();
      setView(next);
      if (next !== "rules") setRulesEventId(null);
    };
    window.addEventListener("hashchange", changeView);
    return () => window.removeEventListener("hashchange", changeView);
  }, []);
  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 3500);
    return () => window.clearTimeout(timeout);
  }, [notice]);
  function navigate(next: View) {
    setRulesEventId(null);
    setView(next);
    if (next === "event") setEventSection("event");
    window.location.hash = next === "groups" ? "organization" : next === "events" ? "events" : next === "rules" ? "house-rules" : "";
    haptic();
    window.scrollTo({ top: 0, behavior: next === "rules" ? "instant" : "smooth" });
  }
  function confirmRulesForEvent() {
    if (!event) return;
    navigate("rules");
    setRulesEventId(event.id);
  }
  function openEvent(item: RopeEvent) {
    setSelectedId(item.id);
    setEventSection("event");
    navigate("event");
  }
  function invitationAccessChanged() {
    void organization.refresh();
    load();
  }
  async function connectTelegram(proof: { initData: string } | { idToken: string }) {
    await organization.authenticate(proof);
    navigate("event");
    setShowAccount(false);
    setNotice("Signed in with Telegram");
  }
  function openAccount() {
    setAuthError("");
    setShowAccount(true);
  }
  async function signInWeb(createAccount = false) {
    if (!webAccount.available) {
      setAuthError(webAccount.error);
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    try {
      await (createAccount ? webAccount.signUp() : webAccount.signIn());
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : "Could not open sign-in."
      );
    } finally {
      setAuthBusy(false);
    }
  }
  async function signInTelegram() {
    const telegram = getTelegram();
    if (!telegram?.initData) {
      const url = telegramLaunchUrl(import.meta.env.VITE_TELEGRAM_BOT_USERNAME);
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
        return;
      }
      setAuthError(
        "The Telegram bot is not connected yet. You can use web sign-in or explore the preview."
      );
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    try {
      if (organizationAuthAvailable) {
        await organization.authenticate({ initData: telegram.initData });
      } else if (apiConfigured) {
        const response = await authenticateTelegram(telegram.initData);
        setLocalAuth({ user: response.user, mode: "verified" });
      } else {
        const user = telegram.initDataUnsafe.user;
        if (!user)
          throw new Error(
            "Open the event from the bot’s Main Mini App to connect your Telegram profile."
          );
        setLocalAuth({ user, mode: "telegram-preview" });
      }
      setShowAccount(false);
      navigate("event");
      setNotice(
        apiConfigured || organizationAuthAvailable
          ? "Signed in with Telegram"
          : "Telegram profile connected in preview mode"
      );
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : "Could not sign in."
      );
    } finally {
      setAuthBusy(false);
    }
  }
  async function signOut() {
    setAuthBusy(true);
    setAuthError("");
    try {
      if (organization.session) {
        await organization.signOut();
        setLocalAuth(null);
        setShowAccount(false);
        navigate("event");
        setNotice("Signed out of Telegram");
        return;
      }
      if (auth?.mode === "authkit") {
        await webAccount.signOut();
        return;
      }
      if (auth?.mode === "verified") await logoutTelegram();
      setLocalAuth(null);
      setShowAccount(false);
      setNotice("Signed out");
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : "Could not sign out."
      );
    } finally {
      setAuthBusy(false);
    }
  }
  function saveDate(item: RopeEvent) {
    downloadCalendar(item);
    haptic();
    setNotice("Calendar file downloaded. Open it to add the jam.");
  }

  function renderEventDetails(responseBox?: ReactNode) {
    if (!event) return null;
    return <>
            <RopeParallax />
            <section className="event-hero">
              <div className="hero-copy">
                <div className="hero-eyebrow">
                  <span className="status-dot" />
                  {isPast ? "PAST EVENT" : "PRIVATE SHIBARI PRACTICE SESSION"}
                  <span className="edition-number">
                    Nº {String(allEvents.indexOf(event) + 1).padStart(2, "0")}
                  </span>
                </div>
                <h1>
                  {event.name === "Private Rope Jam" ? (
                    <>
                      Private
                      <br />
                      <em>Rope Jam.</em>
                    </>
                  ) : (
                    event.name
                  )}
                </h1>
                <p className="hero-description">
                  Private shibari practice session.
                </p>
                <div className="facts-grid hero-facts">
                  <article className="fact">
                    <span className="fact-label">
                      <CalendarDays size={14} />
                      WHEN
                    </span>
                    <h3>{eventDate(event, true)}</h3>
                    <p>
                      {new Intl.DateTimeFormat("en-GB", {
                        weekday: "long",
                        timeZone: event.timeZone,
                      }).format(new Date(event.startsAt))}
                    </p>
                  </article>
                  <article className="fact">
                    <span className="fact-label">
                      <Clock3 size={14} />
                      TIME
                    </span>
                    <h3>
                      {eventTime(event)}–{eventTime(event, event.endsAt)}
                    </h3>
                    <p>
                      Doors from {eventTime(event, event.arrivalFrom)} ·
                      Barcelona time
                    </p>
                  </article>
                  <article className="fact">
                    <span className="fact-label">
                      <span className="currency-icon">€</span>CONTRIBUTION
                    </span>
                    <h3>
                      {event.price.toFixed(2)}
                      <span className="price-currency">€</span>
                    </h3>
                    <p>Per person</p>
                  </article>
                  <article className="fact location-fact">
                    <span className="fact-label">
                      <MapPin size={14} />
                      WHERE
                    </span>
                    <h3>{event.venue}</h3>
                    <p>
                      {event.address}
                      <br />
                      {event.neighborhood}, {event.city}
                    </p>
                    <a
                      className="text-link"
                      href={mapsUrl(event)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open directions <ArrowUpRight size={14} />
                    </a>
                  </article>
                </div>
                {responseBox}
                <div className="hero-actions">
                  {!isPast && (
                    <button
                      className="primary-button"
                      onClick={() => saveDate(event)}
                    >
                      <CalendarDays size={16} />
                      Add to calendar
                      <ArrowUpRight size={16} />
                    </button>
                  )}
                  <a className="text-link" href="#practical">
                    Practical information <ArrowDown size={15} />
                  </a>
                </div>
              </div>
              <figure className="poster-frame">
                <div className="poster-overline">
                  <span>THE INVITATION</span>
                  <span>
                    {new Intl.DateTimeFormat("en-GB", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "2-digit",
                      timeZone: event.timeZone,
                    })
                      .format(new Date(event.startsAt))
                      .replace(/\//g, " / ")}
                  </span>
                </div>
                <img
                  className="event-poster"
                  src={event.poster}
                  alt={`${event.name} invitation: ${eventDate(
                    event
                  )}, ${eventTime(event)}–${eventTime(event, event.endsAt)}, ${
                    event.venue
                  }`}
                />
                <figcaption>
                  <span>PRIVATE SHIBARI PRACTICE SESSION</span>
                  <span>{event.city.toUpperCase()} ↗</span>
                </figcaption>
              </figure>
            </section>

            <section
              className="practical-section"
              id="practical"
              aria-labelledby="practical-heading"
            >
              <div className="section-header">
                <span className="eyebrow">01 / BEFORE YOU COME</span>
                <h2 id="practical-heading">Before you come.</h2>
              </div>
              <div className="room-notes">
                <div>
                  <span className="note-number">01</span>
                  <p>
                    <strong>Capacity: {event.capacity} people.</strong> Please don’t bring uninvited guests.
                  </p>
                </div>
                <div>
                  <span className="note-number">02</span>
                  <p>
                    <strong>
                      {event.suspensionPoints === 1
                        ? "A suspension point is available."
                        : `${event.suspensionPoints} suspension points are available.`}
                    </strong>{" "}
                    Check with the host before using it. Arrive at{" "}
                    {eventTime(event)}, or up to 30 minutes early to settle in.
                  </p>
                </div>
              </div>
              <div className="event-rules-link">
                <p>Our house rules apply to every gathering.</p>
                <a className="text-link" href="#house-rules" onClick={e => { e.preventDefault(); navigate("rules"); }}>
                  Read the house rules <ArrowRight size={15} />
                </a>
              </div>
            </section>

            <section className="next-gathering">
              <div>
                <span className="eyebrow">EVENTS</span>
                <h2>Other events.</h2>
                <p>Browse upcoming and past events.</p>
              </div>
              <button
                className="outline-button"
                onClick={() => navigate("events")}
              >
                Browse all events <ArrowUpRight size={16} />
              </button>
            </section>
    </>;
  }

  // Clear the private UI after session expiry/logout even when the JS is already loaded.
  if (privateServiceMode && !canViewEvents) return (
    <div className="app-shell">
      <header className="site-header"><span>private rope jam.</span></header>
      <main><section className="empty-state">
        <span className="eyebrow">PRIVATE ROPE JAM</span>
        <h1>{!organization.loading && organization.session ? accessDeniedCopy.title : "Sign in to view invitations."}</h1>
        {organization.loading ? <p role="status">Authenticating with Telegram…</p> : <>
          <p>{organization.session ? accessDeniedCopy.description : "Sign in with Telegram to continue."}</p>
          {organization.session && <p>{accessDeniedCopy.help}</p>}
          <TelegramBrowserLogin onAuthenticate={connectTelegram} />
          {organization.session && <button className="text-link" onClick={() => void signOut()}>Sign out <ArrowRight size={14} /></button>}
          {authError && <p className="error-message" role="alert">{authError}</p>}
        </>}
      </section></main>
    </div>
  );

  return (
    <div className="app-shell">
      <header className="site-header">
        <button
          className="wordmark"
          onClick={() => {
            setSelectedId(null);
            navigate("event");
          }}
          aria-label="Private Rope Jam home"
        >
          <RopeMark />
          <span>
            private
            <br />
            rope jam<span className="wordmark-dot">.</span>
          </span>
        </button>
        <nav className="desktop-nav" aria-label="Main navigation">
          <button
            className={view === "event" ? "active" : ""}
            aria-current={view === "event" ? "page" : undefined}
            onClick={() => navigate("event")}
          >
            Event
          </button>
          <button
            className={view === "events" ? "active" : ""}
            aria-current={view === "events" ? "page" : undefined}
            onClick={() => navigate("events")}
          >
            All events
          </button>
          <button
            className={view === "rules" ? "active" : ""}
            aria-current={view === "rules" ? "page" : undefined}
            onClick={() => navigate("rules")}
          >
            House rules
          </button>
          {isSystemAdmin && (
            <a className={view === "groups" ? "active" : ""} href="#organization" aria-current={view === "groups" ? "page" : undefined}>
              Organization
            </a>
          )}
        </nav>
        <button
          className={`account-button ${auth ? "connected" : ""}`}
          onClick={openAccount}
          disabled={webAccount.isLoading}
          aria-label={
            auth
              ? `Account for ${auth.user.first_name}`
              : "Sign in to your account"
          }
        >
          <UserRound size={16} />
          <span>
            {webAccount.isLoading
              ? "Connecting…"
              : auth
              ? auth.user.first_name
              : "Your account"}
          </span>
          <ArrowUpRight size={13} />
        </button>
      </header>

      <main>
        {view === "groups" ? (
          organization.loading ? (
            <section className="empty-state" role="status"><p>Checking organization access…</p></section>
          ) : isSystemAdmin ? (
            <GroupApprovals adminUserId={String(organization.session!.user.id)} onBack={() => navigate("event")} onSessionInvalid={() => void organization.refresh()} />
          ) : (
            <section className="empty-state">
              <span className="eyebrow">ADMIN ACCESS</span>
              <h1>Administrator sign-in required.</h1>
              <p>{organization.session ? "This Telegram account does not have organization access." : "Sign in with the administrator’s Telegram account to manage the organization."}</p>
              {!organization.session && <button className="primary-button" onClick={openAccount}>Sign in <ArrowRight size={16} /></button>}
              <button className="text-link" onClick={() => navigate("event")}>Back to the event <ArrowRight size={16} /></button>
            </section>
          )
        ) : view === "rules" && !confirmingRules ? (
          <HouseRules />
        ) : loadError ? (
          <section className="empty-state error-state">
            <span className="eyebrow">LET’S TRY AGAIN</span>
            <h1>A loose end.</h1>
            <p role="alert">{loadError}</p>
            <button className="primary-button" onClick={load}>
              Reload the event <ArrowRight size={16} />
            </button>
          </section>
        ) : !data ? (
          <section className="empty-state" role="status">
            <RopeMark />
            <p>Getting the room ready…</p>
          </section>
        ) : view === "events" ? (
          <section className="events-page">
            <div className="events-heading">
              <div>
                <span className="eyebrow">A SMALL CIRCLE, EVERY TIME</span>
                <h1>The gatherings.</h1>
              </div>
              <p>
                Dates to come.
                <br />
                Evenings we’ve shared.
              </p>
            </div>
            <div
              className="events-tabs"
              role="group"
              aria-label="Browse events"
            >
              {(["upcoming", "past"] as const).map((value) => (
                <button
                  key={value}
                  className={period === value ? "selected" : ""}
                  aria-pressed={period === value}
                  onClick={() => {
                    setPeriod(value);
                    haptic();
                  }}
                >
                  {value === "upcoming" ? "Upcoming" : "Past events"}
                  <span>{filterEvents(allEvents, value, now).length}</span>
                </button>
              ))}
            </div>
            {visibleEvents.length ? (
              <div className="event-list">
                {visibleEvents.map((item) => (
                  <button
                    key={item.id}
                    className="event-card"
                    onClick={() => openEvent(item)}
                  >
                    <img src={item.poster} alt="Private Rope Jam invitation" />
                    <div className="event-card-content">
                      <span className="eyebrow">
                        {period === "past"
                          ? "PAST EVENT"
                          : "UPCOMING EVENT"}
                      </span>
                      <h2>{item.name}</h2>
                      <p>{eventDate(item)}</p>
                      <span>
                        {eventTime(item)}–{eventTime(item, item.endsAt)}{" "}
                        <span className="small-dot">·</span> {item.venue}
                      </span>
                      <div className="event-card-bottom">
                        <span>
                          {item.price.toFixed(2)}€{" "}
                          <span className="small-dot">·</span> {item.capacity}{" "}
                          people <span className="small-dot">·</span>{" "}
                          {item.inviteOnly ? "Invite-only" : "Gathering"}
                        </span>
                        <span className="circle-arrow">
                          <ArrowUpRight size={19} />
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty-state archive-empty">
                <RopeMark />
                <h2>
                  {period === "past"
                    ? "No past events."
                    : "No upcoming events."}
                </h2>
                <p>
                  {period === "past"
                    ? "Past events will appear here after they end."
                    : "New dates will appear here when announced."}
                </p>
                <button
                  className="text-link"
                  onClick={() =>
                    setPeriod(period === "past" ? "upcoming" : "past")
                  }
                >
                  {period === "past"
                    ? "See upcoming events"
                    : "Browse past events"}
                  <ArrowRight size={15} />
                </button>
              </div>
            )}
            <p className="events-footnote">
              {allEvents.length === 1
                ? "One announced event."
                : "Select an event to view its invitation and details."}
            </p>
          </section>
        ) : !event ? (
          <section className="empty-state">
            <h1>No event invitations.</h1>
            <p>You need to be in an event’s approved group to receive its invitation.</p>
          </section>
        ) : (
          <div className="event-page">
            {showParticipation && auth ? (
              <EventParticipation key={`${event.id}:${auth.user.id}`} event={event} user={auth.user} organizer={isSystemAdmin} preview={previewParticipation} section={eventSection} onSection={setEventSection} onAccessChanged={invitationAccessChanged}
                confirmingRules={confirmingRules} onRulesRequired={confirmRulesForEvent} onRulesBack={() => navigate("event")} onRulesConfirmed={() => { navigate("event"); setNotice("You’re going. See you there."); }}>
                {responseBox => renderEventDetails(responseBox)}
              </EventParticipation>
            ) : renderEventDetails()}
          </div>
        )}
      </main>

      <footer className="site-footer">
        <span>
          PRIVATE ROPE JAM <span className="small-dot">·</span> BARCELONA
        </span>
        <span>Private event · Group members only</span>
        {isSystemAdmin && <a className="text-link" href="#organization">Organization <ArrowUpRight size={12} /></a>}
        <button onClick={openAccount}>
          {auth ? "Your account" : "Sign in"}
          <ArrowUpRight size={12} />
        </button>
      </footer>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        <button
          className={view === "event" ? "active" : ""}
          aria-current={view === "event" ? "page" : undefined}
          onClick={() => navigate("event")}
        >
          Event
        </button>
        <button
          className={view === "events" ? "active" : ""}
          aria-current={view === "events" ? "page" : undefined}
          onClick={() => navigate("events")}
        >
          All events
        </button>
        <button
          className={view === "rules" ? "active" : ""}
          aria-current={view === "rules" ? "page" : undefined}
          onClick={() => navigate("rules")}
        >
          House rules
        </button>
      </nav>
      {notice && (
        <div className="toast" role="status">
          <Check size={16} />
          {notice}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {showAccount && (
        <Modal
          title={
            auth ? `Hi, ${auth.user.first_name}.` : "Sign in to view invitations."
          }
          onClose={() => setShowAccount(false)}
        >
          <span className="eyebrow">PRIVATE ROPE JAM / ACCOUNT</span>
          {auth ? (
            <>
              <p className="modal-description">
                {auth.mode === "authkit"
                  ? "You’re signed in with your web account."
                  : auth.mode === "verified"
                  ? "You’re signed in with Telegram."
                  : auth.mode === "telegram-preview"
                  ? "Your Telegram profile is connected in preview mode."
                  : "You’re browsing with a demo profile."}{" "}
                Select Going on your event invitation to confirm attendance.
              </p>
              {isSystemAdmin && <p className="login-note">System administrator</p>}
              {!organization.session && organizationAuthAvailable && (
                <div className="organizer-tools">
                  <p className="login-note">Connect Telegram to check organization access.</p>
                  <TelegramBrowserLogin onAuthenticate={connectTelegram} />
                </div>
              )}
              <dl className="account-details">
                <div>
                  <dt>Name</dt>
                  <dd>
                    {auth.user.first_name} {auth.user.last_name}
                  </dd>
                </div>
                {auth.user.email && (
                  <div>
                    <dt>Email</dt>
                    <dd>{auth.user.email}</dd>
                  </div>
                )}
                {auth.user.username && (
                  <div>
                    <dt>Telegram</dt>
                    <dd>@{auth.user.username}</dd>
                  </div>
                )}
                <div>
                  <dt>Account</dt>
                  <dd>
                    {auth.mode === "demo"
                      ? "Demo preview"
                      : auth.mode === "telegram-preview"
                      ? "Telegram preview"
                      : auth.mode === "authkit"
                      ? "Web account"
                      : "Telegram"}
                  </dd>
                </div>
              </dl>
              <button
                className="outline-button full-width"
                disabled={authBusy}
                onClick={signOut}
              >
                {authBusy ? "Signing out…" : "Sign out"}
                <ArrowRight size={16} />
              </button>
            </>
          ) : (
            <>
              <p className="modal-description">
                Sign in with Telegram to check your event invitations. Select Going to confirm attendance.
              </p>
              {!inTelegram && !organizationAuthAvailable && (
                <>
                  <button
                    className="primary-button full-width"
                    disabled={authBusy || webAccount.isLoading}
                    onClick={() => signInWeb()}
                  >
                    <UserRound size={16} />
                    {webAccount.isLoading
                      ? "Checking your account…"
                      : authBusy
                      ? "Opening sign-in…"
                      : "Sign in"}
                    <ArrowUpRight size={16} />
                  </button>
                  <button
                    className="text-link create-account-link"
                    disabled={authBusy || webAccount.isLoading}
                    onClick={() => signInWeb(true)}
                  >
                    Create an account <ArrowRight size={14} />
                  </button>
                  {(!webAccount.available || webAccount.error) && (
                    <p className="login-note">{webAccount.error}</p>
                  )}
                  <div className="or-divider">
                    <span />
                    OR
                    <span />
                  </div>
                </>
              )}
              {!inTelegram && organizationAuthAvailable ? (
                <TelegramBrowserLogin onAuthenticate={connectTelegram} />
              ) : <button
                className="outline-button full-width"
                disabled={authBusy || webAccount.isLoading}
                onClick={signInTelegram}
              >
                <Send size={16} />
                {authBusy && inTelegram
                  ? "Connecting…"
                  : "Continue with Telegram"}
                <ArrowUpRight size={16} />
              </button>}
              {inTelegram && !apiConfigured && !organizationAuthAvailable && (
                <p className="login-note">
                  Profile preview only. Telegram verification will be connected
                  with the event backend.
                </p>
              )}
              {usingMockData && !privateServiceMode && (
                <button
                  className="text-link demo-link"
                  disabled={authBusy || webAccount.isLoading}
                  onClick={() => {
                    setLocalAuth({
                      user: { id: 0, first_name: "Guest" },
                      mode: "demo",
                    });
                    setShowAccount(false);
                    navigate("event");
                    setNotice("Browsing with a demo profile");
                  }}
                >
                  Explore with a demo profile <ArrowRight size={14} />
                </button>
              )}
            </>
          )}
          {authError && (
            <p className="error-message" role="alert">
              {authError}
            </p>
          )}
          {isSystemAdmin && (
            <div className="organizer-tools">
              <span className="eyebrow">ORGANIZATION</span>
              <button
                className="outline-button full-width"
                onClick={() => {
                  setShowAccount(false);
                  navigate("groups");
                }}
              >
                Manage organization <ArrowRight size={16} />
              </button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
