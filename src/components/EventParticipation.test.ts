import { createElement, useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EventParticipation } from "./EventParticipation";
import { houseRuleIds, houseRulesVersion } from "../data/houseRules";
import { eventCatalog } from "../data/eventCatalog";
import type { AttendanceResponse, EventAttendance } from "../types/attendance";

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../lib/organization", async importOriginal => ({ ...await importOriginal<object>(), organizationRequest: api }));

let renderer: ReactTestRenderer;
let events: EventTarget;
let response: AttendanceResponse;
let rulesAccepted: boolean;
const onRulesRequired = vi.fn();
const onRulesConfirmed = vi.fn();
const onRulesBack = vi.fn();
const scrollTarget = vi.fn();
const focusTarget = vi.fn();
let permit: ((allowed: boolean) => void) | undefined;
const requestWriteAccess = vi.fn((callback: (allowed: boolean) => void) => { permit = callback; });
const attendance = (state = response): EventAttendance => ({ eventId: eventCatalog[0].id, response: state, canRespond: true, rules: { version: houseRulesVersion, accepted: rulesAccepted }, groups: [{ chatId: "-123", title: "Test" }], people: [], complete: true });
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-14T12:00:00Z"));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  events = new EventTarget(); response = "pending"; permit = undefined; rulesAccepted = true;
  onRulesRequired.mockClear(); onRulesConfirmed.mockClear(); onRulesBack.mockClear();
  scrollTarget.mockClear(); focusTarget.mockClear();
  requestWriteAccess.mockClear(); api.mockReset();
  vi.stubGlobal("window", {
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
    setInterval, clearInterval, setTimeout, clearTimeout,
    matchMedia: vi.fn(() => ({ matches: false })),
    Telegram: { WebApp: { initData: "verified-launch", initDataUnsafe: { user: {} }, isVersionAtLeast: () => true, requestWriteAccess } },
  });
  api.mockImplementation(async (route: string, options?: RequestInit) => {
    if (route.startsWith("attendance?")) return attendance();
    if (route === "rsvp") {
      const body = JSON.parse(options!.body as string);
      response = body.response;
      if (body.rulesVersion === houseRulesVersion) rulesAccepted = true;
      return { response };
    }
    return { notificationSent: true };
  });
});

afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  vi.useRealTimers(); vi.unstubAllGlobals();
});

async function mount() {
  function Flow() {
    const [confirmingRules, setConfirmingRules] = useState(false);
    return createElement(EventParticipation, {
      event: eventCatalog[0], user: { id: 234, first_name: "Alex" }, organizer: false, preview: false,
      section: "event", onSection: vi.fn(), onAccessChanged: vi.fn(), children: box => box,
      confirmingRules,
      onRulesRequired: () => { onRulesRequired(); setConfirmingRules(true); },
      onRulesBack: () => { onRulesBack(); setConfirmingRules(false); },
      onRulesConfirmed: () => { onRulesConfirmed(); setConfirmingRules(false); },
    });
  }
  await act(async () => { renderer = create(createElement(Flow), { createNodeMock: element => ({
    getBoundingClientRect: () => ({ height: 115 }),
    scrollIntoView: (options: ScrollIntoViewOptions) => scrollTarget((element.props as Record<string, unknown>)["aria-controls"] ?? "confirm", options),
    focus: (options: FocusOptions) => focusTarget((element.props as Record<string, unknown>)["aria-controls"] ?? "confirm", options),
  }) }); });
}
const buttons = () => renderer.root.findByProps({ className: "invitation-response-buttons" }).findAllByType("button");
const notificationCalls = () => api.mock.calls.filter(([route]) => route === "rsvp-notification");
const confirmButton = () => renderer.root.findAllByType("button").find(button => button.props.className?.includes("confirmation-button"))!;
const backButton = () => renderer.root.findAllByType("button").find(button => button.children.includes("Back to event"))!;
const agreementButtons = () => renderer.root.findAllByProps({ className: "rule-acceptance-button" });
async function agreeToRules() {
  for (const button of agreementButtons()) if (!button.props["aria-pressed"])
    await act(async () => { button.props.onClick(); });
}
async function confirmReturningAttendance() {
  await act(async () => { buttons()[0].props.onClick(); });
  await act(async () => { confirmButton().props.onClick(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
}

it("shows progress and reveals confirmation only after five agreements, hiding it again if one is withdrawn", async () => {
  rulesAccepted = false;
  await mount();
  await act(async () => { buttons()[0].props.onClick(); });
  expect(agreementButtons()).toHaveLength(5);
  expect(confirmButton()).toBeUndefined();
  expect(renderer.root.findByProps({ id: "rules-acceptance-status" }).children.join("")).toBe("0 of 5 agreed");
  expect(api.mock.calls.filter(([route]) => route === "rsvp")).toHaveLength(0);
  for (let index = 0; index < 4; index++) await act(async () => { agreementButtons()[index].props.onClick(); });
  expect(confirmButton()).toBeUndefined();
  expect(agreementButtons()[0].props["aria-pressed"]).toBe(true);
  expect(agreementButtons()[0].props["aria-label"]).toContain("Agreed to");
  await act(async () => { agreementButtons()[4].props.onClick(); });
  expect(confirmButton().props.disabled).toBe(false);
  await act(async () => { renderer.root.findAllByProps({ className: "rule-heading" })[0].props.onClick(); });
  await act(async () => { agreementButtons()[0].props.onClick(); });
  expect(confirmButton()).toBeUndefined();
  expect(api.mock.calls.filter(([route]) => route === "rsvp")).toHaveLength(0);
  await act(async () => { backButton().props.onClick(); });
  await act(async () => { buttons()[0].props.onClick(); });
  expect(agreementButtons().every(button => button.props["aria-pressed"] === false)).toBe(true);
});

it("opens rules before first attendance, cancels without saving, and saves agreement and Going in one request", async () => {
  rulesAccepted = false;
  await mount();
  await act(async () => { buttons()[0].props.onClick(); });
  expect(onRulesRequired).toHaveBeenCalledOnce();
  expect(api.mock.calls.filter(([route]) => route === "rsvp")).toHaveLength(0);
  expect(JSON.stringify(renderer.toJSON())).toContain("House rules");
  expect(renderer.root.findAllByProps({ className: "rule rule-with-acceptance" })).toHaveLength(5);
  await act(async () => { backButton().props.onClick(); });
  expect(response).toBe("pending");
  await act(async () => { buttons()[1].props.onClick(); });
  expect(response).toBe("not-going");
  await act(async () => { buttons()[0].props.onClick(); });
  await agreeToRules();
  await act(async () => { confirmButton().props.onClick(); });
  const writes = api.mock.calls.filter(([route]) => route === "rsvp");
  expect(JSON.parse(writes.at(-1)![1].body)).toMatchObject({ response: "going", rulesVersion: houseRulesVersion, acceptedRuleIds: houseRuleIds });
  expect(onRulesConfirmed).not.toHaveBeenCalled();
  expect(confirmButton().props.className).toContain("confirmation-success");
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(onRulesConfirmed).toHaveBeenCalledOnce();
  expect(rulesAccepted).toBe(true);
  expect(buttons()[0].props["aria-pressed"]).toBe(true);
  await act(async () => { buttons()[2].props.onClick(); });
  await act(async () => { buttons()[0].props.onClick(); });
  expect(onRulesRequired).toHaveBeenCalledTimes(3);
});

it("always opens rules for returning attendees, reuses saved agreements, and waits for explicit confirmation", async () => {
  response = "not-going";
  await mount();
  await act(async () => { buttons()[0].props.onClick(); });
  expect(onRulesRequired).toHaveBeenCalledOnce();
  expect(api.mock.calls.filter(([route]) => route === "rsvp")).toHaveLength(0);
  expect(response).toBe("not-going");
  expect(agreementButtons().every(button => button.props["aria-pressed"])).toBe(true);
  expect(renderer.root.findAllByProps({ className: "rule-heading" }).every(button => button.props["aria-expanded"] === false)).toBe(true);
  expect(confirmButton().props.disabled).toBe(false);
  await act(async () => { backButton().props.onClick(); });
  expect(response).toBe("not-going");
  await confirmReturningAttendance();
  expect(response).toBe("going");
  expect(onRulesConfirmed).toHaveBeenCalledOnce();
  await act(async () => { buttons()[0].props.onClick(); });
  expect(onRulesRequired).toHaveBeenCalledTimes(3);
  expect(confirmButton().props.disabled).toBe(false);
});

it("stays on the rules page after a failed save and blocks duplicate confirmations while saving", async () => {
  rulesAccepted = false;
  await mount();
  await act(async () => { buttons()[0].props.onClick(); });
  await agreeToRules();
  api.mockRejectedValueOnce(new Error("Connection lost"));
  await act(async () => { confirmButton().props.onClick(); });
  expect(onRulesConfirmed).not.toHaveBeenCalled();
  expect(response).toBe("pending");
  expect(JSON.stringify(renderer.toJSON())).toContain("Connection lost");
  expect(confirmButton().props.className).toContain("confirmation-idle");
  expect(agreementButtons().every(button => button.props["aria-pressed"])).toBe(true);
  const saving = deferred<{ response: AttendanceResponse }>();
  api.mockImplementationOnce(() => saving.promise);
  await act(async () => { confirmButton().props.onClick(); confirmButton().props.onClick(); });
  expect(confirmButton().props.disabled).toBe(true);
  expect(confirmButton().props["aria-busy"]).toBe(true);
  expect(confirmButton().props.className).toContain("confirmation-loading");
  expect(agreementButtons().every(button => button.props.disabled)).toBe(true);
  expect(api.mock.calls.filter(([route]) => route === "rsvp")).toHaveLength(2);
  await act(async () => { response = "going"; rulesAccepted = true; saving.resolve({ response }); });
  expect(onRulesConfirmed).not.toHaveBeenCalled();
  expect(confirmButton().props.className).toContain("confirmation-success");
  expect(confirmButton().props.disabled).toBe(true);
  expect(confirmButton().props["aria-busy"]).toBe(false);
  await act(async () => { confirmButton().props.onClick(); await vi.advanceTimersByTimeAsync(999); });
  expect(onRulesConfirmed).not.toHaveBeenCalled();
  expect(api.mock.calls.filter(([route]) => route === "rsvp")).toHaveLength(2);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(onRulesConfirmed).toHaveBeenCalledOnce();
});

it("collapses an agreed rule, scrolls to the next unread rule, and allows reopening without losing agreement", async () => {
  rulesAccepted = false;
  await mount();
  await act(async () => { buttons()[0].props.onClick(); });
  await act(async () => { agreementButtons()[0].props.onClick(); });
  expect(renderer.root.findByProps({ id: "rule-body-consent" }).props).toMatchObject({ inert: true, "aria-hidden": true });
  expect(renderer.root.findAllByProps({ className: "rule-heading" })[0].props["aria-expanded"]).toBe(false);
  expect(scrollTarget).not.toHaveBeenCalled();
  await act(async () => { await vi.advanceTimersByTimeAsync(370); });
  expect(scrollTarget).toHaveBeenLastCalledWith("rule-body-respect", { behavior: "smooth", block: "start" });
  expect(focusTarget).toHaveBeenLastCalledWith("rule-body-respect", { preventScroll: true });
  await act(async () => { renderer.root.findAllByProps({ className: "rule-heading" })[0].props.onClick(); });
  expect(renderer.root.findByProps({ id: "rule-body-consent" }).props.inert).toBe(false);
  expect(agreementButtons()[0].props["aria-pressed"]).toBe(true);
  await act(async () => { agreementButtons()[0].props.onClick(); });
  expect(renderer.root.findByProps({ id: "rule-body-consent" }).props.inert).toBe(false);
  expect(agreementButtons()[0].props["aria-pressed"]).toBe(false);
});

it("wraps to an earlier unread rule with reduced motion and brings confirmation into view after the last agreement", async () => {
  rulesAccepted = false;
  vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
  await mount();
  await act(async () => { buttons()[0].props.onClick(); });
  await act(async () => { agreementButtons()[4].props.onClick(); await vi.advanceTimersByTimeAsync(0); });
  expect(scrollTarget).toHaveBeenLastCalledWith("rule-body-consent", { behavior: "auto", block: "start" });
  await agreeToRules();
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(scrollTarget).toHaveBeenLastCalledWith("confirm", { behavior: "auto", block: "nearest" });
  expect(focusTarget).toHaveBeenLastCalledWith("confirm", { preventScroll: true });
});

it("cancels delayed success navigation when the attendance flow unmounts", async () => {
  rulesAccepted = false;
  await mount();
  await act(async () => { buttons()[0].props.onClick(); });
  await agreeToRules();
  await act(async () => { confirmButton().props.onClick(); });
  expect(confirmButton().props.className).toContain("confirmation-success");
  await act(async () => { renderer.unmount(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  expect(onRulesConfirmed).not.toHaveBeenCalled();
});

it("reminds existing attendees about a missing agreement without cancelling attendance", async () => {
  response = "going"; rulesAccepted = false;
  await mount();
  expect(buttons()[0].props["aria-pressed"]).toBe(true);
  expect(JSON.stringify(renderer.toJSON())).toContain("Please confirm our house rules before attending.");
  await act(async () => { buttons()[0].props.onClick(); });
  expect(onRulesRequired).toHaveBeenCalledOnce();
  expect(response).toBe("going");
  await act(async () => { backButton().props.onClick(); });
  expect(buttons()[0].props["aria-pressed"]).toBe(true);
  expect(JSON.stringify(renderer.toJSON())).toContain("Please confirm our house rules before attending.");
});

it("selects Going after confirmation before Telegram's permission callback returns", async () => {
  await mount();
  await confirmReturningAttendance();
  expect(response).toBe("going");
  expect(buttons()[0].props).toMatchObject({ className: "primary-button", "aria-pressed": true, disabled: false });
  expect(requestWriteAccess).toHaveBeenCalledTimes(1);
  expect(notificationCalls()).toHaveLength(0);
  await act(async () => { permit!(true); });
  expect(notificationCalls()).toHaveLength(1);
  expect(api.mock.calls.find(([route]) => route === "rsvp")?.[1].body).toContain('"deferNotification":true');
});

it("ignores an older refresh during a save and suppresses focus refreshes and duplicate clicks in flight", async () => {
  await mount();
  await act(async () => { buttons()[0].props.onClick(); });
  const stale = deferred<EventAttendance>();
  api.mockImplementationOnce(() => stale.promise);
  await act(async () => { events.dispatchEvent(new Event("focus")); });
  expect(confirmButton().props.disabled).toBe(false);
  const saving = deferred<{ response: AttendanceResponse }>();
  api.mockImplementationOnce(() => saving.promise);
  await act(async () => {
    confirmButton().props.onClick();
    confirmButton().props.onClick();
    events.dispatchEvent(new Event("focus"));
  });
  expect(api.mock.calls.filter(([route]) => route === "rsvp")).toHaveLength(1);
  expect(api.mock.calls.filter(([route]) => route.startsWith("attendance?"))).toHaveLength(2);
  await act(async () => { response = "going"; saving.resolve({ response }); });
  await act(async () => { stale.resolve(attendance("pending")); });
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(buttons()[0].props).toMatchObject({ "aria-pressed": true, disabled: false });
});

it("supports Not going and returning to Pending while an earlier permission request is still open", async () => {
  await mount();
  await confirmReturningAttendance();
  await act(async () => { buttons()[1].props.onClick(); });
  expect(buttons()[1].props["aria-pressed"]).toBe(true);
  await act(async () => { buttons()[2].props.onClick(); });
  expect(response).toBe("pending");
  expect(buttons()[2].props["aria-pressed"]).toBe(true);
  await act(async () => { permit!(true); });
  expect(notificationCalls().map(([, options]) => JSON.parse(options.body).response)).toEqual(["pending"]);
});

it("keeps the saved response when permission never replies or delivery fails", async () => {
  await mount();
  await confirmReturningAttendance();
  api.mockRejectedValueOnce(new Error("Bot unavailable"));
  await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
  expect(buttons()[0].props).toMatchObject({ "aria-pressed": true, disabled: false });
  expect(JSON.stringify(renderer.toJSON())).toContain("Response saved. Bot message could not be delivered.");
});

it("leaves the previous selection and allows retry when saving fails", async () => {
  await mount();
  api.mockRejectedValueOnce(new Error("Connection lost"));
  await act(async () => { buttons()[1].props.onClick(); });
  expect(buttons()[2].props["aria-pressed"]).toBe(true);
  expect(buttons()[1].props.disabled).toBe(false);
  expect(requestWriteAccess).not.toHaveBeenCalled();
  await act(async () => { buttons()[1].props.onClick(); });
  expect(buttons()[1].props["aria-pressed"]).toBe(true);
});
