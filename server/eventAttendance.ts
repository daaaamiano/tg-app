import type { Attendee, RopeEvent } from "../src/types/event";
import type { EventAttendance, EventPerson, AttendanceResponse } from "../src/types/attendance";
import type { OrganizationSession } from "../src/types/organization";
import { eventCatalog } from "../src/data/eventCatalog";
import { houseRuleIds, houseRulesVersion, isCompleteRulesAcceptance } from "../src/data/houseRules";
import type { DatabaseQuery } from "./authStorage";
import { GroupAccessError, type GroupAccess } from "./groupAccess";
import type { UserAccessStore } from "./userAccess";
import type { loadGroupRoster } from "./telegramMembers";
import type { TelegramServerConfig } from "./telegramConfig";

export const isAttendanceResponse = (value: unknown): value is AttendanceResponse => typeof value === "string" && ["pending", "going", "not-going"].includes(value);
const validId = (value: string) => /^[1-9]\d{0,15}$/.test(value) && Number.isSafeInteger(Number(value));
const validChatId = (value: string) => /^-[1-9]\d{0,15}$/.test(value) && Number.isSafeInteger(Number(value));
const nameOf = (user: Attendee) => [user.first_name, user.last_name].filter(Boolean).join(" ").slice(0, 200);
const rulesRequired = () => new GroupAccessError(428, "Please read and agree to each house rule before confirming attendance.");

export interface AttendanceStore {
  groupIds(eventId: string): Promise<string[]>;
  setGroups(eventId: string, chatIds: string[], adminId: number): Promise<void>;
  responses(eventId: string): Promise<EventPerson[]>;
  hasAcceptedRules(userId: string, version: string): Promise<boolean>;
  save(eventId: string, user: Attendee, response: AttendanceResponse, rulesVersion?: string, acceptedRuleIds?: string[]): Promise<void>;
}

export function createMemoryAttendanceStore(): AttendanceStore {
  const links = new Map<string, string[]>();
  const replies = new Map<string, Map<string, EventPerson>>();
  const agreements = new Map<string, { acceptedAt: string; ruleIds: string[] }>();
  return {
    async groupIds(eventId) { return [...(links.get(eventId) ?? [])]; },
    async setGroups(eventId, chatIds) { links.set(eventId, [...new Set(chatIds)]); },
    async responses(eventId) { return [...(replies.get(eventId)?.values() ?? [])].map(person => ({ ...person })); },
    async hasAcceptedRules(userId, version) { return isCompleteRulesAcceptance(agreements.get(`${userId}:${version}`)?.ruleIds); },
    async save(eventId, user, response, rulesVersion, acceptedRuleIds) {
      const agreementKey = `${user.id}:${houseRulesVersion}`;
      if (response === "going") {
        if (rulesVersion !== undefined && (rulesVersion !== houseRulesVersion || !isCompleteRulesAcceptance(acceptedRuleIds))) throw rulesRequired();
        if (!isCompleteRulesAcceptance(agreements.get(agreementKey)?.ruleIds) && rulesVersion !== houseRulesVersion) throw rulesRequired();
        if (!agreements.has(agreementKey)) agreements.set(agreementKey, { acceptedAt: new Date().toISOString(), ruleIds: [...houseRuleIds] });
      }
      const people = replies.get(eventId) ?? new Map<string, EventPerson>();
      people.set(String(user.id), { userId: String(user.id), name: nameOf(user), response });
      replies.set(eventId, people);
    },
  };
}

export function createDatabaseAttendanceStore(query: DatabaseQuery): AttendanceStore {
  const run: DatabaseQuery = async (sql, values) => {
    try { return await query(sql, values); }
    catch { throw new GroupAccessError(503, "Event responses are temporarily unavailable. Please try again."); }
  };
  return {
    async groupIds(eventId) {
      const result = await run("SELECT unnest(chat_ids)::text AS chat_id FROM event_groups WHERE event_id = $1 ORDER BY chat_id", [eventId]);
      return result.rows.map(row => {
        if (typeof row.chat_id !== "string" || !validChatId(row.chat_id)) throw new GroupAccessError();
        return row.chat_id;
      });
    },
    async setGroups(eventId, chatIds, adminId) {
      // A single row makes replacement atomic even with concurrent group changes.
      await run(`INSERT INTO event_groups (event_id, chat_ids, updated_by) VALUES ($1, $2::bigint[], $3)
        ON CONFLICT (event_id) DO UPDATE SET chat_ids = EXCLUDED.chat_ids,
        updated_by = EXCLUDED.updated_by, updated_at = now()`, [eventId, [...new Set(chatIds)], adminId]);
    },
    async responses(eventId) {
      const result = await run("SELECT user_id::text, name, response FROM event_responses WHERE event_id = $1 ORDER BY name, user_id", [eventId]);
      return result.rows.map(row => {
        if (typeof row.user_id !== "string" || !validId(row.user_id) || typeof row.name !== "string" || !isAttendanceResponse(row.response)) throw new GroupAccessError();
        return { userId: row.user_id, name: row.name, response: row.response };
      });
    },
    async hasAcceptedRules(userId, version) {
      return (await run(`SELECT 1 FROM house_rules_acceptances WHERE user_id = $1 AND rules_version = $2
        AND accepted_rule_ids @> $3::text[] AND cardinality(accepted_rule_ids) = cardinality($3::text[])`, [userId, version, houseRuleIds])).rows.length > 0;
    },
    async save(eventId, user, response, rulesVersion, acceptedRuleIds) {
      if (response === "going" && rulesVersion !== undefined && (rulesVersion !== houseRulesVersion || !isCompleteRulesAcceptance(acceptedRuleIds))) throw rulesRequired();
      // One SQL statement commits the agreement and RSVP together, or neither.
      const result = await run(`WITH accepted AS (
          INSERT INTO house_rules_acceptances (user_id, rules_version, accepted_rule_ids)
          SELECT $2::bigint, $6::text, $7::text[] WHERE $4::text = 'going' AND $5::text = $6::text
          ON CONFLICT (user_id, rules_version) DO UPDATE SET accepted_rule_ids = EXCLUDED.accepted_rule_ids,
            accepted_at = CASE WHEN house_rules_acceptances.accepted_rule_ids @> EXCLUDED.accepted_rule_ids
              AND cardinality(house_rules_acceptances.accepted_rule_ids) = cardinality(EXCLUDED.accepted_rule_ids)
              THEN house_rules_acceptances.accepted_at ELSE now() END
          RETURNING user_id
        )
        INSERT INTO event_responses (event_id, user_id, name, response)
        SELECT $1, $2::bigint, $3, $4
        WHERE $4::text <> 'going' OR EXISTS (SELECT 1 FROM accepted)
          OR EXISTS (SELECT 1 FROM house_rules_acceptances WHERE user_id = $2::bigint AND rules_version = $6
            AND accepted_rule_ids @> $7::text[] AND cardinality(accepted_rule_ids) = cardinality($7::text[]))
        ON CONFLICT (event_id, user_id) DO UPDATE
        SET name = EXCLUDED.name, response = EXCLUDED.response, updated_at = now()
        RETURNING user_id`, [eventId, String(user.id), nameOf(user), response, rulesVersion ?? null, houseRulesVersion, houseRuleIds]);
      if (!result.rows.length) throw rulesRequired();
    },
  };
}

export function createEventAttendance({ store, groups, users, configReader, rosterLoader, catalog = eventCatalog }: {
  store: AttendanceStore; groups: GroupAccess; users: UserAccessStore;
  configReader: () => TelegramServerConfig; rosterLoader: typeof loadGroupRoster; catalog?: RopeEvent[];
}) {
  function event(eventId: string) {
    const found = catalog.find(item => item.id === eventId);
    if (!found) throw new GroupAccessError(404, "This event is not available.");
    return found;
  }
  async function groupIds(eventId: string) {
    event(eventId);
    const saved = await store.groupIds(eventId);
    return saved.length ? saved : [configReader().chatId];
  }
  async function invited(userId: number, ids: string[]) {
    if (!Number.isSafeInteger(userId) || userId <= 0) return false;
    if ((await users.get(String(userId)))?.state === "blocked") return false;
    const member = await groups.canViewEvents(userId, ids);
    return member && (await users.get(String(userId)))?.state !== "blocked";
  }
  async function canViewEvent(session: OrganizationSession, eventId: string) {
    const ids = await groupIds(eventId);
    if (session.isSystemAdmin) return true;
    const member = await invited(Number(session.user.id), ids);
    return member && (await groupIds(eventId)).join() === ids.join();
  }
  async function authorize(session: OrganizationSession, eventId: string) {
    if (!await canViewEvent(session, eventId)) throw new GroupAccessError(403, "You need to be a member of this event’s approved group to view the invitation.");
  }
  return {
    canViewEvent,
    async visibleEvents(session: OrganizationSession) {
      const visible: RopeEvent[] = [];
      for (const item of catalog) if (await canViewEvent(session, item.id)) visible.push(item);
      return { events: visible };
    },
    async setGroup(session: OrganizationSession, eventId: string, chatId: string, stillAuthorized: () => Promise<boolean>) {
      event(eventId);
      if (!session.isSystemAdmin) throw new GroupAccessError(403, "Only the system administrator can change the event group.");
      if (!validChatId(chatId)) throw new GroupAccessError(400, "Choose a valid event group.");
      const available = (await groups.list()).find(group => group.chatId === chatId && group.approved && group.botIsMember);
      if (!available) throw new GroupAccessError(400, "Choose an approved group with the bot present.");
      if (!await stillAuthorized()) throw new GroupAccessError(401, "Your session expired. Sign in again.");
      await store.setGroups(eventId, [chatId], Number(session.user.id));
    },
    async reply(session: OrganizationSession, eventId: string, response: AttendanceResponse, stillAuthorized: () => Promise<boolean>, rulesVersion?: string, acceptedRuleIds?: string[]) {
      const item = event(eventId);
      if (!isAttendanceResponse(response)) throw new GroupAccessError(400, "Choose Going, Not going, or Pending.");
      if (new Date(item.endsAt).getTime() <= Date.now()) throw new GroupAccessError(409, "This event has ended. Responses are closed.");
      const ids = await groupIds(eventId);
      if (!await invited(Number(session.user.id), ids)) throw new GroupAccessError(403, "You need to be a member of this event’s approved group to respond.");
      // Recheck links after Telegram responds, including reassignment during the lookup.
      if ((await groupIds(eventId)).join() !== ids.join()) throw new GroupAccessError(409, "The event group changed. Reload your invitation.");
      if (!await stillAuthorized()) throw new GroupAccessError(401, "Your session expired. Sign in again.");
      await store.save(eventId, session.user, response, rulesVersion, acceptedRuleIds);
      return { response };
    },
    async notificationEvent(session: OrganizationSession, eventId: string, response: AttendanceResponse, stillAuthorized: () => Promise<boolean>) {
      const item = event(eventId);
      const ids = await groupIds(eventId);
      if (!await invited(Number(session.user.id), ids)) throw new GroupAccessError(403, "Your event invitation is no longer available.");
      const saved = (await store.responses(eventId)).find(person => person.userId === String(session.user.id));
      if (saved?.response !== response) throw new GroupAccessError(409, "Your response changed. Reload your invitation.");
      if ((await groupIds(eventId)).join() !== ids.join()) throw new GroupAccessError(409, "The event group changed. Reload your invitation.");
      if (!await stillAuthorized()) throw new GroupAccessError(401, "Your session expired. Sign in again.");
      return item;
    },
    async attendance(session: OrganizationSession, eventId: string): Promise<EventAttendance> {
      await authorize(session, eventId);
      const ids = await groupIds(eventId);
      const knownGroups = (await groups.list()).filter(group => ids.includes(group.chatId));
      const replies = await store.responses(eventId);
      const candidates = new Map<string, EventPerson>();
      let complete = true;
      let notice: string | undefined;
      if (session.isSystemAdmin) {
        for (const id of ids) {
          const group = knownGroups.find(item => item.chatId === id);
          if (!group?.approved || !group.botIsMember) { complete = false; continue; }
          try {
            const roster = await rosterLoader({ ...configReader(), chatId: id });
            if (!roster.complete) complete = false;
            for (const member of roster.members) if (!member.isBot)
              candidates.set(member.id, { userId: member.id, name: member.name, response: "pending" });
          } catch { complete = false; }
        }
        if (!complete) notice = "The group member list is incomplete. Pending shows identified members only.";
      }
      for (const person of replies) if (session.isSystemAdmin || person.response === "going") candidates.set(person.userId, person);
      const people: EventPerson[] = [];
      // Stored replies alone never establish current eligibility.
      const members = [...candidates.values()];
      for (let index = 0; index < members.length; index += 5) {
        const checked = await Promise.all(members.slice(index, index + 5).map(async person =>
          await invited(Number(person.userId), ids) ? person : null));
        people.push(...checked.filter((person): person is EventPerson => person !== null));
      }
      people.sort((a, b) => a.name.localeCompare(b.name) || a.userId.localeCompare(b.userId));
      const canRespond = await invited(Number(session.user.id), ids);
      if (!session.isSystemAdmin && !canRespond) throw new GroupAccessError(403, "Your event invitation is no longer available.");
      if ((await groupIds(eventId)).join() !== ids.join()) throw new GroupAccessError(409, "The event group changed. Reload your invitation.");
      return {
        eventId, response: canRespond ? replies.find(person => person.userId === String(session.user.id))?.response ?? "pending" : null,
        canRespond, rules: { version: houseRulesVersion, accepted: await store.hasAcceptedRules(String(session.user.id), houseRulesVersion) },
        groups: ids.map(id => ({ chatId: id, title: knownGroups.find(group => group.chatId === id)?.title ?? "Event group" })),
        people, complete, notice,
      };
    },
  };
}
