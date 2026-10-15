import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { houseRuleIds, houseRulesVersion } from "../src/data/houseRules";
import { eventCatalog } from "../src/data/eventCatalog";
import { createDatabaseAttendanceStore, createEventAttendance, createMemoryAttendanceStore, isAttendanceResponse } from "./eventAttendance";
import { createGroupAccess, createMemoryGroupStore, GroupAccessError } from "./groupAccess";
import { createMemoryUserAccessStore } from "./userAccess";
import { createPrivateService } from "./privateService";

const config = { token: "123456789:test-secret-only", chatId: "-123", loginClientId: "123456789" };
const eventId = eventCatalog[0].id;
const attendee = { user: { id: 234, first_name: "Alex" }, isSystemAdmin: false, expiresAt: Date.now() + 60000 };
const admin = { user: { id: 17666600, first_name: "Organizer" }, isSystemAdmin: true, expiresAt: Date.now() + 60000 };
const origin = "https://private.example";

async function fixture(catalog = eventCatalog) {
  const membership = new Map<string, Set<number>>([["-123", new Set([234, 345])], ["-456", new Set([234, 456])]]);
  const groupStore = createMemoryGroupStore();
  for (const id of membership.keys()) { await groupStore.discover(id, `Group ${id}`); await groupStore.setApproval(id, true, 17666600); }
  const api = async <T>(method: string, body?: object): Promise<T> => {
    const args = body as { chat_id: string; user_id: number };
    if (method === "getMe") return { id: 123456789 } as T;
    if (method === "getWebhookInfo") return { url: "https://example.test/hook" } as T;
    if (method === "getChat") return { id: Number(args.chat_id), title: `Group ${args.chat_id}`, type: "supergroup" } as T;
    return { status: args.user_id === 123456789 ? "administrator" : membership.get(args.chat_id)?.has(args.user_id) ? "member" : "left",
      user: { id: args.user_id, is_bot: args.user_id === 123456789, first_name: "Member" } } as T;
  };
  const groups = createGroupAccess(groupStore, () => config, api);
  const users = createMemoryUserAccessStore();
  const store = createMemoryAttendanceStore();
  const rosterLoader = vi.fn(async (options: typeof config) => ({
    chatId: options.chatId, title: `Group ${options.chatId}`, totalMembers: membership.get(options.chatId)?.size ?? 0,
    members: [...(membership.get(options.chatId) ?? [])].map(id => ({ id: String(id), name: `Member ${id}`, isBot: false, role: "member" as const })),
    complete: true, source: "mtproto" as const, checkedAt: new Date().toISOString(),
  }));
  const service = createEventAttendance({ store, groups, users, configReader: () => config, rosterLoader, catalog });
  return { service, store, groups, groupStore, users, membership, rosterLoader };
}

beforeEach(() => vi.spyOn(Date, "now").mockReturnValue(new Date("2026-10-14T12:00:00Z").getTime()));
afterEach(() => vi.restoreAllMocks());

describe("event invitations and responses", () => {
  it("requires the current rules, keeps other responses immediate, and reuses agreement across events", async () => {
    const nextEvent = { ...eventCatalog[0], id: "another-gathering" };
    const { service, store } = await fixture([...eventCatalog, nextEvent]);
    expect((await service.attendance(attendee, eventId)).rules).toEqual({ version: houseRulesVersion, accepted: false });
    await expect(service.reply(attendee, eventId, "going", async () => true)).rejects.toMatchObject({ status: 428 });
    await expect(service.reply(attendee, eventId, "going", async () => true, "old-version")).rejects.toMatchObject({ status: 428 });
    for (const acceptedIds of [undefined, [], houseRuleIds.slice(0, 4), [...houseRuleIds.slice(0, 4), houseRuleIds[0]], [...houseRuleIds.slice(0, 4), "unknown-rule"]]) {
      await expect(service.reply(attendee, eventId, "going", async () => true, houseRulesVersion, acceptedIds)).rejects.toMatchObject({ status: 428 });
    }
    expect(await store.responses(eventId)).toEqual([]);
    expect(await store.hasAcceptedRules("234", houseRulesVersion)).toBe(false);
    for (const response of ["not-going", "pending"] as const)
      await service.reply(attendee, eventId, response, async () => true);
    expect(await store.hasAcceptedRules("234", houseRulesVersion)).toBe(false);
    await service.reply(attendee, eventId, "going", async () => true, houseRulesVersion, houseRuleIds);
    expect((await service.attendance(attendee, nextEvent.id)).rules.accepted).toBe(true);
    await service.reply(attendee, nextEvent.id, "going", async () => true);
    expect((await service.attendance(attendee, nextEvent.id)).response).toBe("going");
    expect(await store.hasAcceptedRules("345", houseRulesVersion)).toBe(false);
    expect(await store.hasAcceptedRules("234", "future-version")).toBe(false);
    await expect(service.reply(attendee, nextEvent.id, "going", async () => true, "old-version")).rejects.toMatchObject({ status: 428 });
  });

  it("starts Pending, confirms only Going, and keeps one response while changing or resetting it", async () => {
    const { service, store } = await fixture();
    expect(await service.attendance(attendee, eventId)).toMatchObject({ response: "pending", people: [] });
    expect(await store.responses(eventId)).toEqual([]);
    await service.reply(attendee, eventId, "going", async () => true, houseRulesVersion, houseRuleIds);
    expect(await service.attendance(attendee, eventId)).toMatchObject({ response: "going", people: [{ userId: "234", response: "going" }] });
    await service.reply(attendee, eventId, "going", async () => true);
    expect(await store.responses(eventId)).toHaveLength(1);
    for (const response of ["not-going", "pending"] as const) {
      await service.reply(attendee, eventId, response, async () => true);
      expect(await service.attendance(attendee, eventId)).toMatchObject({ response, people: [] });
    }
  });

  it("requires the event group even for explicitly allowed users and members of other approved groups", async () => {
    const { service, users, membership } = await fixture();
    membership.get("-123")!.delete(234);
    await users.set("234", "Alex", "allowed", 17666600);
    expect(await service.visibleEvents(attendee)).toEqual({ events: [] });
    await expect(service.attendance(attendee, eventId)).rejects.toMatchObject({ status: 403 });
    await expect(service.reply(attendee, eventId, "going", async () => true, houseRulesVersion, houseRuleIds)).rejects.toMatchObject({ status: 403 });
    await service.setGroup(admin, eventId, "-456", async () => true);
    expect((await service.visibleEvents(attendee)).events).toHaveLength(1);
  });

  it("deduplicates overlapping groups and shows organizers Pending members who have never replied", async () => {
    const { service, store } = await fixture();
    await store.setGroups(eventId, ["-123", "-456"], 17666600);
    const attendance = await service.attendance(admin, eventId);
    expect(attendance.people.map(person => person.userId).sort()).toEqual(["234", "345", "456"]);
    expect(attendance.people.every(person => person.response === "pending")).toBe(true);
    expect(attendance).toMatchObject({ response: null, canRespond: false, complete: true });
    await expect(service.reply(admin, eventId, "going", async () => true)).rejects.toMatchObject({ status: 403 });
  });

  it("removes departed and blocked members from confirmed People without deleting their response", async () => {
    const { service, users, membership, store, groupStore } = await fixture();
    await service.reply(attendee, eventId, "going", async () => true, houseRulesVersion, houseRuleIds);
    membership.get("-123")!.delete(234);
    expect((await service.attendance(admin, eventId)).people.some(person => person.userId === "234")).toBe(false);
    expect(await store.responses(eventId)).toHaveLength(1);
    membership.get("-123")!.add(234);
    await users.set("234", "Alex", "blocked", 17666600);
    expect((await service.attendance(admin, eventId)).people.some(person => person.userId === "234")).toBe(false);
    await expect(service.reply(attendee, eventId, "going", async () => true, houseRulesVersion, houseRuleIds)).rejects.toMatchObject({ status: 403 });
    await users.set("234", "Alex", "group", 17666600);
    await groupStore.setApproval("-123", false, 17666600);
    expect(await service.visibleEvents(attendee)).toEqual({ events: [] });
  });

  it("labels incomplete pending lists, denies expired sessions and closed events, and refuses invalid responses", async () => {
    const { service, rosterLoader, store } = await fixture();
    rosterLoader.mockRejectedValueOnce(new Error("Unavailable"));
    expect(await service.attendance(admin, eventId)).toMatchObject({ complete: false, notice: expect.stringContaining("incomplete") });
    await expect(service.reply(attendee, eventId, "going", async () => false)).rejects.toMatchObject({ status: 401 });
    expect(await store.responses(eventId)).toEqual([]);
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-10-17T12:00:00Z").getTime());
    await expect(service.reply(attendee, eventId, "going", async () => true, houseRulesVersion, houseRuleIds)).rejects.toMatchObject({ status: 409 });
    for (const value of [["going"], { response: "going" }, "confirmed", null]) expect(isAttendanceResponse(value)).toBe(false);
  });

  it("denies a response if the group assignment changes during membership verification", async () => {
    const { service, groups, store } = await fixture();
    const check = groups.canViewEvents;
    vi.spyOn(groups, "canViewEvents").mockImplementationOnce(async (id, ids) => {
      await store.setGroups(eventId, ["-456"], 17666600);
      return check(id, ids);
    });
    await expect(service.reply(attendee, eventId, "going", async () => true, houseRulesVersion, houseRuleIds)).rejects.toMatchObject({ status: 409 });
    expect(await store.responses(eventId)).toEqual([]);
  });

  it("fails closed during a membership outage", async () => {
    const { service, groups, store } = await fixture();
    vi.spyOn(groups, "canViewEvents").mockRejectedValue(new GroupAccessError());
    await expect(service.reply(attendee, eventId, "going", async () => true, houseRulesVersion, houseRuleIds)).rejects.toMatchObject({ status: 503 });
    expect(await store.responses(eventId)).toEqual([]);
  });
});

const dist = mkdtempSync(join(tmpdir(), "ropelab-invitation-test-"));
writeFileSync(join(dist, "index.html"), "PRIVATE_APP");
writeFileSync(join(dist, "private-rope-jam-poster.jpg"), "PRIVATE_POSTER");
afterAll(() => rmSync(dist, { recursive: true, force: true }));

it("integrates verified sign-in, event access, RSVP and People with server-derived identity and origin checks", async () => {
  const fixtureData = await fixture();
  const attendanceNotifier = vi.fn().mockResolvedValue(true);
  const app = createPrivateService({ origin, dist, config, secureCookies: true, groups: fixtureData.groups, users: fixtureData.users,
    attendance: fixtureData.store, rosterLoader: fixtureData.rosterLoader, attendanceNotifier });
  const get = (route: string, cookie = "") => request(app).get(`/api/telegram/${route}`).set("Host", "private.example").set("Cookie", cookie);
  async function login(id: number) {
    const fields = { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: "Alex" }) };
    const data = Object.entries(fields).map(([key, value]) => `${key}=${value}`).join("\n");
    const key = createHmac("sha256", "WebAppData").update(config.token).digest();
    const initData = new URLSearchParams({ ...fields, hash: createHmac("sha256", key).update(data).digest("hex") }).toString();
    const result = await request(app).post("/api/telegram/authenticate").set("Host", "private.example").set("Origin", origin).send({ initData });
    expect(result.status).toBe(200);
    return result.headers["set-cookie"][0].split(";")[0] as string;
  }
  const post = (route: string, cookie: string, body: object, source = origin) => request(app).post(`/api/telegram/${route}`).set("Host", "private.example").set("Origin", source).set("Cookie", cookie).send(body);
  expect((await get("events")).status).toBe(401);
  const cookie = await login(234);
  expect((await get("events", cookie)).body.events).toHaveLength(1);
  expect((await get(`attendance?eventId=${eventId}`, cookie)).body.response).toBe("pending");
  expect((await post("rsvp", cookie, { eventId, response: "going", userId: "456" }, "https://elsewhere.test")).status).toBe(403);
  expect((await post("rsvp", cookie, { eventId, response: ["going"] })).status).toBe(400);
  expect((await post("event-group", cookie, { eventId, chatId: "-456" })).status).toBe(403);
  expect(attendanceNotifier).not.toHaveBeenCalled();
  expect((await post("rsvp", cookie, { eventId, response: "going" })).status).toBe(428);
  expect((await post("rsvp", cookie, { eventId, response: "going", rulesVersion: true })).status).toBe(400);
  expect((await post("rsvp", cookie, { eventId, response: "going", rulesVersion: "outdated" })).status).toBe(428);
  expect((await post("rsvp", cookie, { eventId, response: "going", rulesVersion: houseRulesVersion })).status).toBe(428);
  expect((await post("rsvp", cookie, { eventId, response: "going", rulesVersion: houseRulesVersion, acceptedRuleIds: houseRuleIds.slice(0, 4) })).status).toBe(428);
  expect((await post("rsvp", cookie, { eventId, response: "going", rulesVersion: houseRulesVersion, acceptedRuleIds: "all" })).status).toBe(400);
  expect((await get(`attendance?eventId=${eventId}`, cookie)).body.rules.accepted).toBe(false);
  expect((await post("rsvp", cookie, { eventId, response: "going", userId: "456", deferNotification: true, rulesVersion: houseRulesVersion, acceptedRuleIds: houseRuleIds })).body).toEqual({ response: "going" });
  expect(attendanceNotifier).not.toHaveBeenCalled();
  expect((await post("rsvp-notification", cookie, { eventId, response: "going" }, "https://elsewhere.test")).status).toBe(403);
  expect((await post("rsvp-notification", cookie, { eventId, response: "pending" })).status).toBe(409);
  expect(attendanceNotifier).not.toHaveBeenCalled();
  expect((await post("rsvp-notification", cookie, { eventId, response: "going", userId: "456" })).body).toEqual({ response: "going", notificationSent: true });
  expect(attendanceNotifier).toHaveBeenLastCalledWith(config.token, 234, eventCatalog[0], "going");
  expect((await get(`attendance?eventId=${eventId}`, cookie)).body.people).toEqual([{ userId: "234", name: "Alex", response: "going" }]);
  expect((await post("rsvp", cookie, { eventId, response: "not-going" })).status).toBe(200);
  expect(attendanceNotifier).toHaveBeenLastCalledWith(config.token, 234, eventCatalog[0], "not-going");
  expect((await get(`attendance?eventId=${eventId}`, cookie)).body.people).toEqual([]);
  attendanceNotifier.mockRejectedValueOnce(new Error("Bot blocked"));
  expect((await post("rsvp", cookie, { eventId, response: "pending" })).body).toEqual({ response: "pending", notificationSent: false });
  expect(attendanceNotifier).toHaveBeenLastCalledWith(config.token, 234, eventCatalog[0], "pending");
  expect((await get(`attendance?eventId=${eventId}`, cookie)).body.response).toBe("pending");
  const organizer = await login(17666600);
  expect((await post("event-group", organizer, { eventId, chatId: "-456" })).status).toBe(200);
  fixtureData.membership.get("-456")!.delete(234);
  expect((await get("events", cookie)).body.events).toEqual([]);
  expect((await get(`attendance?eventId=${eventId}`, cookie)).status).toBe(403);
  expect((await post("rsvp-notification", cookie, { eventId, response: "pending" })).status).toBe(403);
  for (const path of ["/private-rope-jam-poster.jpg", "/private%2Drope-jam-poster.jpg", "/private-rope-jam-poster.jpg/"])
    expect((await request(app).get(path).set("Host", "private.example").set("Cookie", cookie)).status).toBe(403);
  expect((await post("logout", cookie, {})).status).toBe(200);
  expect((await get(`attendance?eventId=${eventId}`, cookie)).status).toBe(401);
  expect((await post("rsvp-notification", cookie, { eventId, response: "pending" })).status).toBe(401);
});

const pool = process.env.TEST_DATABASE_URL ? new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL }) : undefined;
afterAll(async () => { await pool?.end(); });
(pool ? it : it.skip)("persists event links and a unique response across database-backed instances", async () => {
  const query = (sql: string, values?: unknown[]) => pool!.query(sql, values);
  const first = createDatabaseAttendanceStore(query), second = createDatabaseAttendanceStore(query);
  const id = "database-invitation-test";
  try {
    await first.setGroups(id, ["-123", "-456"], 17666600);
    expect((await second.groupIds(id)).sort()).toEqual(["-123", "-456"]);
    await second.setGroups(id, ["-456"], 17666600);
    expect(await first.groupIds(id)).toEqual(["-456"]);
    await Promise.all([first.setGroups(id, ["-123"], 17666600), second.setGroups(id, ["-456"], 17666600)]);
    expect(await first.groupIds(id)).toHaveLength(1);
    await Promise.all([first.save(id, attendee.user, "going", houseRulesVersion, houseRuleIds), second.save(id, attendee.user, "going", houseRulesVersion, houseRuleIds)]);
    expect(await second.responses(id)).toEqual([{ userId: "234", name: "Alex", response: "going" }]);
    await second.save(id, attendee.user, "not-going");
    expect(await first.responses(id)).toEqual([{ userId: "234", name: "Alex", response: "not-going" }]);
    await first.save(id, attendee.user, "pending");
    expect((await second.responses(id))[0].response).toBe("pending");
  } finally {
    await query("DELETE FROM event_responses WHERE event_id = $1", [id]);
    await query("DELETE FROM event_groups WHERE event_id = $1", [id]);
    await query("DELETE FROM house_rules_acceptances WHERE user_id = $1", [attendee.user.id]);
  }
});

(pool ? it : it.skip)("atomically persists agreements across instances, preserves the first acceptance date, and rolls back failed RSVPs", async () => {
  const query = (sql: string, values?: unknown[]) => pool!.query(sql, values);
  const first = createDatabaseAttendanceStore(query), second = createDatabaseAttendanceStore(query);
  const user = { id: 90101, first_name: "Rules test" }, failedUser = { id: 90102, first_name: "Failed save" };
  const id = "rules-database-test";
  try {
    await query("INSERT INTO house_rules_acceptances (user_id, rules_version) VALUES ($1, $2), ($1, $3)", [failedUser.id, "2026-10-15", houseRulesVersion]);
    expect(await first.hasAcceptedRules(String(failedUser.id), houseRulesVersion)).toBe(false);
    await expect(first.save(id, failedUser, "going")).rejects.toMatchObject({ status: 428 });
    await expect(first.save(id, user, "going")).rejects.toMatchObject({ status: 428 });
    await first.save(id, user, "not-going");
    expect(await second.hasAcceptedRules(String(user.id), houseRulesVersion)).toBe(false);
    await first.save(id, user, "going", houseRulesVersion, houseRuleIds);
    expect((await query("SELECT accepted_rule_ids FROM house_rules_acceptances WHERE user_id = $1", [user.id])).rows[0].accepted_rule_ids).toEqual(houseRuleIds);
    const acceptedAt = (await query("SELECT accepted_at FROM house_rules_acceptances WHERE user_id = $1", [user.id])).rows[0].accepted_at;
    await Promise.all([
      second.save(id, user, "going", houseRulesVersion, houseRuleIds),
      first.save(`${id}-next`, user, "going", houseRulesVersion, houseRuleIds),
    ]);
    expect((await query("SELECT accepted_at FROM house_rules_acceptances WHERE user_id = $1", [user.id])).rows[0].accepted_at).toEqual(acceptedAt);
    expect(await second.hasAcceptedRules(String(user.id), houseRulesVersion)).toBe(true);
    expect(await second.hasAcceptedRules(String(user.id), "next-version")).toBe(false);
    await second.save(`${id}-next`, user, "going");
    await expect(second.save(id, user, "going", "outdated")).rejects.toMatchObject({ status: 428 });
    await expect(first.save(null as unknown as string, failedUser, "going", houseRulesVersion, houseRuleIds)).rejects.toMatchObject({ status: 503 });
    expect(await second.hasAcceptedRules(String(failedUser.id), houseRulesVersion)).toBe(false);
  } finally {
    await query("DELETE FROM event_responses WHERE user_id = ANY($1::bigint[])", [[user.id, failedUser.id]]);
    await query("DELETE FROM house_rules_acceptances WHERE user_id = ANY($1::bigint[])", [[user.id, failedUser.id]]);
  }
});
