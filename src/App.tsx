import { useEffect, useState } from "react";
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
import { RopeParallax } from "./components/RopeParallax";
import { useWebAccount } from "./components/AppAuthProvider";
import { houseRules } from "./data/event";
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

type View = "event" | "events";

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
  const [view, setView] = useState<View>("event");
  const [period, setPeriod] = useState<EventPeriod>("upcoming");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAccount, setShowAccount] = useState(
    () => window.location.pathname === "/login"
  );
  const [localAuth, setLocalAuth] = useState<AuthSession | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [notice, setNotice] = useState("");
  const [jumpToRules, setJumpToRules] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const webAccount = useWebAccount();
  const auth = webAccount.session ?? localAuth;
  const inTelegram = isInTelegram();
  const allEvents = data?.events ?? [];
  const visibleEvents = filterEvents(allEvents, period, now);
  const event =
    allEvents.find((item) => item.id === selectedId) ??
    filterEvents(allEvents, "upcoming", now)[0] ??
    filterEvents(allEvents, "past", now)[0];
  const isPast = event ? new Date(event.endsAt) <= now : false;

  function load() {
    setLoadError("");
    getEvent()
      .then(setData)
      .catch((error) =>
        setLoadError(
          error instanceof Error
            ? error.message
            : "The event could not be loaded."
        )
      );
  }
  useEffect(load, []);
  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 3500);
    return () => window.clearTimeout(timeout);
  }, [notice]);
  useEffect(() => {
    if (!jumpToRules || view !== "event" || !event) return;
    document
      .getElementById("house-rules")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
    setJumpToRules(false);
  }, [jumpToRules, view, event]);

  function navigate(next: View) {
    setView(next);
    setJumpToRules(false);
    haptic();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function openEvent(item: RopeEvent) {
    setSelectedId(item.id);
    navigate("event");
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
      if (apiConfigured) {
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
      setNotice(
        apiConfigured
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
            The jam
          </button>
          <button
            className={view === "events" ? "active" : ""}
            aria-current={view === "events" ? "page" : undefined}
            onClick={() => navigate("events")}
          >
            All events
          </button>
          <button
            onClick={() => {
              setView("event");
              setJumpToRules(true);
            }}
          >
            House rules <ArrowDown size={12} />
          </button>
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
        {loadError ? (
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
                          ? "PAST GATHERING"
                          : "NEXT GATHERING"}
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
                    ? "Our story starts here."
                    : "A little pause between knots."}
                </h2>
                <p>
                  {period === "past"
                    ? "No past gatherings yet. Our first jam is coming up."
                    : "No new dates announced yet. Come back for the next gathering."}
                </p>
                <button
                  className="text-link"
                  onClick={() =>
                    setPeriod(period === "past" ? "upcoming" : "past")
                  }
                >
                  {period === "past"
                    ? "See the upcoming jam"
                    : "Browse past events"}
                  <ArrowRight size={15} />
                </button>
              </div>
            )}
            <p className="events-footnote">
              {allEvents.length === 1
                ? "One announced gathering. More dates will appear here when they’re ready."
                : "Small gatherings, shared on our own terms."}
            </p>
          </section>
        ) : !event ? (
          <section className="empty-state">
            <h1>See you soon.</h1>
            <p>No gatherings announced yet.</p>
          </section>
        ) : (
          <>
            <section className="event-hero">
              <RopeParallax />
              <div className="hero-copy">
                <div className="hero-eyebrow">
                  <span className="status-dot" />
                  {isPast ? "A PAST GATHERING" : "A PRIVATE SHIBARI GATHERING"}
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
                  A small, vetted circle. A friendly space.
                  <br />
                  You’ll probably already know each other.
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
                    The practical bits <ArrowDown size={15} />
                  </a>
                </div>
                <div className="private-note">
                  <span className="tiny-line" />
                  <span>
                    {event.inviteOnly
                      ? "Invite-only. Everyone is vetted."
                      : "A small gathering."}
                  </span>
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
                  <span>A LITTLE ROPE. GOOD COMPANY.</span>
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
                    <strong>{event.capacity} people. All vetted.</strong> A
                    private gathering, with familiar faces. Please don’t bring
                    anyone who hasn’t been invited.
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
            </section>

            <section
              className="house-rules"
              id="house-rules"
              aria-labelledby="rules-heading"
            >
              <div className="rules-intro">
                <span className="eyebrow">02 / HOW WE SHARE THE ROOM</span>
                <h2 id="rules-heading">
                  Friendly.
                  <br />
                  <em>Consent-led.</em>
                </h2>
                <p>
                  A few shared agreements.
                  <br />
                  Everyone’s comfort matters.
                </p>
                <span className="rules-stamp">
                  ALL GENDERS. ALL BODIES. RESPECT.
                </span>
              </div>
              <div className="rules-list">
                {houseRules.map((rule, index) => (
                  <article className="rule" key={rule.title}>
                    <span className="rule-number">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <h3>{rule.title}</h3>
                      <p>{rule.text}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
            <section className="next-gathering">
              <div>
                <span className="eyebrow">THERE’S A THREAD TO FOLLOW</span>
                <h2>Same circle. Next time.</h2>
                <p>Find upcoming dates and previous gatherings in one place.</p>
              </div>
              <button
                className="outline-button"
                onClick={() => navigate("events")}
              >
                Browse all events <ArrowUpRight size={16} />
              </button>
            </section>
          </>
        )}
      </main>

      <footer className="site-footer">
        <span>
          PRIVATE ROPE JAM <span className="small-dot">·</span> BARCELONA
        </span>
        <span>A little rope. A lot of respect.</span>
        <button onClick={openAccount}>
          {auth ? "Your account" : "Sign in"}
          <ArrowUpRight size={12} />
        </button>
      </footer>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        <button
          className={view === "event" ? "active" : ""}
          onClick={() => navigate("event")}
        >
          The jam
        </button>
        <button
          className={view === "events" ? "active" : ""}
          onClick={() => navigate("events")}
        >
          All events
        </button>
        <button
          onClick={() => {
            setView("event");
            setJumpToRules(true);
          }}
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
            auth ? `Hi, ${auth.user.first_name}.` : "Your place in the circle."
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
                Attendance is confirmed by the host.
              </p>
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
                Sign in to your event account. This is a private, vetted
                gathering; signing in doesn’t reserve a place.
              </p>
              {!inTelegram && (
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
              <button
                className="outline-button full-width"
                disabled={authBusy || webAccount.isLoading}
                onClick={signInTelegram}
              >
                <Send size={16} />
                {authBusy && inTelegram
                  ? "Connecting…"
                  : "Continue with Telegram"}
                <ArrowUpRight size={16} />
              </button>
              {inTelegram && !apiConfigured && (
                <p className="login-note">
                  Profile preview only. Telegram verification will be connected
                  with the event backend.
                </p>
              )}
              {usingMockData && (
                <button
                  className="text-link demo-link"
                  disabled={authBusy || webAccount.isLoading}
                  onClick={() => {
                    setLocalAuth({
                      user: { id: 0, first_name: "Guest" },
                      mode: "demo",
                    });
                    setShowAccount(false);
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
        </Modal>
      )}
    </div>
  );
}
