import pg from "pg";
import { afterAll, describe, expect, it, vi } from "vitest";
import { canViewEvents, createDatabaseUserAccessStore, createMemoryUserAccessStore } from "./userAccess";
import { GroupAccessError, type GroupAccess } from "./groupAccess";

const adminId = 17666600;
const groups = (check: () => Promise<boolean>): GroupAccess => ({ list: async () => [], setApproval: async () => {}, hasGroup: async () => false, canViewEvents: check });

describe("individual access decisions", () => {
  it("adds outsiders, removes approved group members, and restores group rules without Telegram dependency for overrides", async () => {
    const users = createMemoryUserAccessStore();
    const check = vi.fn(async () => true);
    const access = groups(check);
    await users.set("234", "Person", "blocked", adminId);
    expect(await canViewEvents(234, access, users)).toBe(false);
    await users.set("234", "Person", "allowed", adminId);
    expect(await canViewEvents(234, access, users)).toBe(true);
    expect(check).not.toHaveBeenCalled();
    await users.set("234", "Person", "group", adminId);
    expect(await users.list()).toEqual([]);
    expect(await canViewEvents(234, access, users)).toBe(true);
    expect(await canViewEvents(234, groups(async () => false), users)).toBe(false);
  });

  it("withholds access if the administrator removes a user while Telegram responds", async () => {
    const users = createMemoryUserAccessStore();
    const access = groups(async () => { await users.set("234", "Person", "blocked", adminId); return true; });
    expect(await canViewEvents(234, access, users)).toBe(false);
  });

  it("rejects malformed IDs, self-removal, unauthorized administrators and expired sessions", async () => {
    const users = createMemoryUserAccessStore();
    for (const id of ["0", "-1", "1e3", "00123", "9007199254740992", "@person"]) {
      await expect(users.set(id, "Person", "allowed", adminId)).rejects.toMatchObject({ status: 400 });
    }
    await expect(users.set(String(adminId), "Admin", "blocked", adminId)).rejects.toMatchObject({ status: 400 });
    await expect(users.set("234", "Person", "allowed", 234)).rejects.toMatchObject({ status: 403 });
    await expect(users.set("234", "Person", "allowed", adminId, async () => false)).rejects.toMatchObject({ status: 401 });
    await expect(users.set("234", "x".repeat(101), "allowed", adminId)).rejects.toMatchObject({ status: 400 });
    expect(await users.list()).toEqual([]);
  });

  it("fails closed when the saved decisions cannot be loaded", async () => {
    const users = createDatabaseUserAccessStore(async () => { throw new Error("offline"); });
    const check = vi.fn(async () => true);
    await expect(canViewEvents(234, groups(check), users)).rejects.toBeInstanceOf(GroupAccessError);
    expect(check).not.toHaveBeenCalled();
  });
});

const pool = process.env.TEST_DATABASE_URL ? new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL }) : undefined;
afterAll(async () => { await pool?.end(); });
(pool ? it : it.skip)("persists user decisions and their administrator across independent backend stores", async () => {
  const query = (sql: string, values?: unknown[]) => pool!.query(sql, values);
  const first = createDatabaseUserAccessStore(query), second = createDatabaseUserAccessStore(query);
  const id = "987654321001";
  try {
    await first.set(id, "Integration test", "allowed", adminId);
    expect(await second.get(id)).toEqual({ userId: id, name: "Integration test", state: "allowed" });
    await second.set(id, "Integration test", "blocked", adminId);
    expect((await first.list()).find(user => user.userId === id)?.state).toBe("blocked");
    const audit = await query("SELECT updated_by::text FROM user_access WHERE user_id = $1", [id]);
    expect(audit.rows[0].updated_by).toBe(String(adminId));
    await second.set(id, "", "group", adminId);
    expect(await first.get(id)).toBeUndefined();
  } finally { await query("DELETE FROM user_access WHERE user_id = $1", [id]); }
});
