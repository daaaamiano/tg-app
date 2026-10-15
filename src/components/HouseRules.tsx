import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { houseRules } from "../data/houseRules";
import { eventDate } from "../lib/events";
import type { RopeEvent } from "../types/event";
import { RuleAcceptanceButton } from "./RuleAcceptanceButton";
import { ConfirmationButton } from "./ConfirmationButton";
import { LottieAnimation } from "./LottieAnimation";

export function HouseRules({ confirmation }: { confirmation?: {
  event: RopeEvent; saving: boolean; confirmed: boolean; alreadyAgreed: boolean; unavailable: boolean; error: string;
  onConfirm: (acceptedRuleIds: string[]) => void; onBack: () => void;
} }) {
  const [acceptedIds, setAcceptedIds] = useState<string[]>(() => confirmation?.alreadyAgreed ? houseRules.map(rule => rule.id) : []);
  const [collapsedIds, setCollapsedIds] = useState<string[]>(() => confirmation?.alreadyAgreed ? houseRules.map(rule => rule.id) : houseRules.slice(1).map(rule => rule.id));
  const [dockHeight, setDockHeight] = useState(128);
  const dock = useRef<HTMLDivElement>(null);
  const headings = useRef(new Map<string, HTMLButtonElement>());
  const confirmButton = useRef<HTMLButtonElement>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const acceptedCount = houseRules.filter(rule => acceptedIds.includes(rule.id)).length;
  const allAccepted = acceptedCount === houseRules.length;
  const disabled = confirmation?.saving || confirmation?.confirmed || confirmation?.unavailable;

  useEffect(() => () => clearTimeout(scrollTimer.current), []);
  useEffect(() => {
    if (!confirmation || !dock.current) return;
    const measure = () => { if (dock.current) setDockHeight(dock.current.getBoundingClientRect().height); };
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    resize?.observe(dock.current);
    window.addEventListener("resize", measure);
    measure();
    return () => { resize?.disconnect(); window.removeEventListener("resize", measure); };
  }, [Boolean(confirmation)]);

  function changeAgreement(id: string, index: number, accepted: boolean) {
    if (disabled) return;
    clearTimeout(scrollTimer.current);
    const nextIds = accepted ? [...acceptedIds.filter(value => value !== id), id] : acceptedIds.filter(value => value !== id);
    setAcceptedIds(nextIds);
    setCollapsedIds(previous => accepted ? [...previous.filter(value => value !== id), id] : previous.filter(value => value !== id));
    if (!accepted) return;
    headings.current.get(id)?.focus({ preventScroll: true });
    const next = houseRules.map((_, offset) => houseRules[(index + offset + 1) % houseRules.length])
      .find(rule => !nextIds.includes(rule.id));
    if (next) setCollapsedIds(previous => previous.filter(value => value !== next.id));
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    // Wait for the collapsed row to settle before positioning the next rule.
    scrollTimer.current = setTimeout(() => {
      const target = next ? headings.current.get(next.id) : confirmButton.current;
      target?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: next ? "start" : "nearest" });
      target?.focus({ preventScroll: true });
    }, reducedMotion ? 0 : 370);
  }

  return (
    <section className={`house-rules${confirmation ? " house-rules-confirming" : ""}${confirmation?.confirmed ? " house-rules-confirmed" : ""}`} aria-labelledby="rules-heading" style={confirmation ? { paddingBottom: dockHeight + 32 } : undefined}>
      <div className="rules-intro">
        {confirmation?.confirmed && <LottieAnimation kind="success" className="rules-success-animation" />}
        <h1 id="rules-heading">{confirmation?.confirmed ? "You’re going" : "House rules"}</h1>
        <p>{confirmation?.confirmed ? `${confirmation.event.name} · ${eventDate(confirmation.event)}` : confirmation ? confirmation.alreadyAgreed ? "Your agreements are saved. Review them, then confirm attendance." : "Accept each rule to confirm attendance." : "These rules apply to every event."}</p>
      </div>
      <div className="rules-list" hidden={confirmation?.confirmed}>
        {houseRules.map((rule, index) => confirmation ? (
          <article className="rule rule-with-acceptance" key={rule.id} data-accepted={acceptedIds.includes(rule.id)}>
            <h3><button type="button" className="rule-heading" aria-expanded={!collapsedIds.includes(rule.id)} aria-controls={`rule-body-${rule.id}`}
              ref={element => { if (element) headings.current.set(rule.id, element); else headings.current.delete(rule.id); }}
              onClick={() => { clearTimeout(scrollTimer.current); setCollapsedIds(previous => previous.includes(rule.id) ? previous.filter(id => id !== rule.id) : [...previous, rule.id]); }}>
              <span className="rule-number">{String(index + 1).padStart(2, "0")}</span><span className="rule-title">{rule.title}</span>
              <span className="rule-heading-indicators">{acceptedIds.includes(rule.id) && <Check size={16} className="rule-heading-check" aria-label="Agreed" />}<ChevronDown size={16} className="rule-chevron" aria-hidden="true" /></span>
            </button></h3>
            <div id={`rule-body-${rule.id}`} className={`rule-body${collapsedIds.includes(rule.id) ? " rule-body-collapsed" : ""}`}
              inert={collapsedIds.includes(rule.id)} aria-hidden={collapsedIds.includes(rule.id)}>
              <div className="rule-body-inner">
                <p>{rule.text}</p>
                <div className="rule-actions"><RuleAcceptanceButton label={rule.title} accepted={acceptedIds.includes(rule.id)} disabled={disabled}
                  onChange={accepted => changeAgreement(rule.id, index, accepted)} /></div>
              </div>
            </div>
          </article>
        ) : (
          <article className="rule" key={rule.id}>
            <span className="rule-number">{String(index + 1).padStart(2, "0")}</span>
            <div><h3>{rule.title}</h3><p>{rule.text}</p></div>
          </article>
        ))}
      </div>
      {confirmation && <>
        <div className="rules-confirmation">
          <p className="rules-confirmation-event">{confirmation.event.name} · {eventDate(confirmation.event)}</p>
          <button className="text-link" disabled={confirmation.saving || confirmation.confirmed} onClick={confirmation.onBack}>Back to event</button>
          <p className="rules-confirmation-note">Agreements are saved for all events. You’ll need to agree again if the rules change.</p>
        </div>
        <div className="rules-confirmation-dock" ref={dock}>
          <div className="rules-dock-content">
            <div className="rules-progress">
              <div className="rules-progress-heading">
                <span>House rules</span>
                <span id="rules-acceptance-status" role="status">{acceptedCount} of {houseRules.length} agreed</span>
              </div>
              <div className="rules-progress-track" aria-hidden="true">
                {houseRules.map(rule => <span className={acceptedIds.includes(rule.id) ? "accepted" : ""} key={rule.id}><span /></span>)}
              </div>
              {confirmation.error && <p className="error-message" role="alert">{confirmation.error}</p>}
            </div>
            {allAccepted && <div className="rules-confirm-reveal">
              <ConfirmationButton state={confirmation.confirmed ? "success" : confirmation.saving ? "loading" : "idle"}
                buttonRef={confirmButton} describedBy="rules-acceptance-status" disabled={disabled}
                label="Confirm attendance" loadingLabel="Confirming…" successLabel="You’re going"
                onClick={() => { if (allAccepted && !disabled) confirmation.onConfirm(houseRules.filter(rule => acceptedIds.includes(rule.id)).map(rule => rule.id)); }} />
              <span className="rules-save-status" role="status">{confirmation.confirmed ? "Attendance confirmed." : confirmation.saving ? "Saving your response…" : "All rules accepted."}</span>
            </div>}
          </div>
        </div>
      </>}
    </section>
  );
}
