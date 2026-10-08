import pg from "pg";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createDatabaseGroupStore, createGroupAccess, createMemoryGroupStore, GroupAccessError } from "./groupAccess";

const botId = 123456789;
const config = { token: "123456789:test-secret-only", chatId: "-123", loginClientId: "123456789" };
function fixture() {
  const state = { admin: true, botPresent: true, status: "member", isMember: true, unavailable: false, webhook: "" };
  const api = vi.fn(async <T>(method: string, body?: object): Promise<T> => {
    if (state.unavailable) throw new GroupAccessError();
    const args = body as { user_id?: number; chat_id?: string };
    const result = method === "getMe" ? { id: botId }
      : method === "getWebhookInfo" ? { url: state.webhook }
      : method === "getUpdates" ? [{ my_chat_member: { chat: { id: -456, type: "supergroup" } } }]
      : method === "getChat" ? { id: Number(args.chat_id), title: "Test group", type: "supergroup" }
      : args.user_id === botId ? { status: !state.botPresent ? "left" : state.admin ? "administrator" : "member", user: { id: botId, first_name: "Bot", is_bot: true } }
      : { status: state.status, is_member: state.isMember, user: { id: args.user_id, first_name: "Person", is_bot: false } };
    return result as T;
  });
  const store = createMemoryGroupStore();
  const groups = createGroupAccess(store, () => config, api);
  return { state, api, store, groups };
}

describe("server-owned Telegram group access", () => {
  it("discovers group titles without acknowledging updates, preserves approvals on refresh and leaves webhooks alone", async () => {
    const { groups, api, state } = fixture();
    expect((await groups.list()).map(group => group.chatId)).toEqual(["-123", "-456"]);
    const updateCall = api.mock.calls.find(call => call[0] === "getUpdates");
    expect(updateCall?.[1]).toEqual({ timeout: 0, limit: 100 });
    await groups.setApproval("-123", true, 17666600);
    expect((await groups.list()).find(group => group.chatId === "-123")?.approved).toBe(true);
    state.webhook = "https://existing.example/webhook";
    api.mockClear();
    await groups.list();
    expect(api.mock.calls.some(call => call[0] === "getUpdates" || call[0] === "setWebhook")).toBe(false);
  });

  it("grants only fresh positive membership and denies departures, bans and removal of the bot", async () => {
    const { groups, state } = fixture();
    await groups.list();
    expect(await groups.canViewEvents(234)).toBe(false);
    await groups.setApproval("-123", true, 17666600);
    expect(await groups.canViewEvents(234)).toBe(true);
    for (const status of ["left", "kicked"]) { state.status = status; expect(await groups.canViewEvents(234)).toBe(false); }
    state.status = "restricted";
    state.isMember = true;
    expect(await groups.canViewEvents(234)).toBe(true);
    state.isMember = false;
    expect(await groups.canViewEvents(234)).toBe(false);
    state.status = "member";
    state.admin = false;
    expect(await groups.canViewEvents(234)).toBe(true);
    await groups.setApproval("-456", true, 17666600);
    state.botPresent = false;
    expect(await groups.canViewEvents(234)).toBe(false);
    await expect(groups.setApproval("-456", true, 17666600)).rejects.toMatchObject({ status: 409 });
  });

  it("fails closed on Telegram errors but still lists stored groups and permits revocation", async () => {
    const { groups, state } = fixture();
    await groups.list(); await groups.setApproval("-123", true, 17666600);
    state.unavailable = true;
    await expect(groups.canViewEvents(234)).rejects.toBeInstanceOf(GroupAccessError);
    expect((await groups.list())[0].verificationError).toBeTruthy();
    await groups.setApproval("-123", false, 17666600);
    expect(await groups.canViewEvents(234)).toBe(false);
  });

  it("rechecks approval after Telegram responds and rejects a mutation after admin logout", async () => {
    const store = createMemoryGroupStore();
    await store.discover("-123", "Test"); await store.setApproval("-123", true, 17666600);
    let release!: () => void;
    let entered!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    const checking = new Promise<void>(resolve => { entered = resolve; });
    const api = async <T>(method: string, body?: object): Promise<T> => {
      const args = body as { user_id: number };
      if (method === "getMe") return { id: botId } as T;
      if (args.user_id === botId) return { status: "administrator", user: { id: botId, first_name: "Bot", is_bot: true } } as T;
      entered(); await waiting;
      return { status: "member", user: { id: 234, first_name: "Person", is_bot: false } } as T;
    };
    const groups = createGroupAccess(store, () => config, api);
    const access = groups.canViewEvents(234);
    await checking;
    await store.setApproval("-123", false, 17666600);
    release();
    expect(await access).toBe(false);
    await expect(groups.setApproval("-123", true, 17666600, async () => false)).rejects.toMatchObject({ status: 401 });
    expect((await store.list())[0].approved).toBe(false);
  });
});

const pool = process.env.TEST_DATABASE_URL ? new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL }) : undefined;
afterAll(async () => { await pool?.end(); });
(pool ? it : it.skip)("persists approvals across backend instances in the existing PostgreSQL table", async () => {
  const query = (sql: string, values?: unknown[]) => pool!.query(sql, values);
  const first = createDatabaseGroupStore(query), second = createDatabaseGroupStore(query);
  const id = "-987654321001";
  try {
    await first.discover(id, "Database test group");
    await first.setApproval(id, true, 17666600);
    expect((await second.list()).find(group => group.chatId === id)?.approved).toBe(true);
    await second.discover(id, "Renamed test group");
    expect((await first.list()).find(group => group.chatId === id)?.approved).toBe(true);
    await second.setApproval(id, false, 17666600);
    expect((await first.list()).find(group => group.chatId === id)?.approved).toBe(false);
    const audit = await query("SELECT updated_by::text FROM approved_groups WHERE chat_id=$1", [id]);
    expect(audit.rows[0].updated_by).toBe("17666600");
  } finally { await query("DELETE FROM approved_groups WHERE chat_id=$1", [id]); }
});
