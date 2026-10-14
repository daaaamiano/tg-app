import type { UserAccessRule, UserAccessState } from "../src/types/userAccess";
import type { DatabaseQuery } from "./authStorage";
import { GroupAccessError, type GroupAccess } from "./groupAccess";
import { SYSTEM_ADMIN_TELEGRAM_ID } from "./telegramAuth";

export interface UserAccessStore {
  list(): Promise<UserAccessRule[]>;
  get(userId: string): Promise<UserAccessRule | undefined>;
  set(userId: string, name: string, state: UserAccessState, adminId: number, stillAuthorized?: () => Promise<boolean>): Promise<void>;
}

const validUserId = (id: string) => /^[1-9]\d{0,15}$/.test(id) && Number.isSafeInteger(Number(id));
const storageError = () => new GroupAccessError(503, "User access storage is temporarily unavailable. Please try again.");

async function validateMutation(userId: string, name: string, state: UserAccessState, adminId: number, stillAuthorized?: () => Promise<boolean>) {
  if (!validUserId(userId) || !["allowed", "blocked", "group"].includes(state) || typeof name !== "string" || name.length > 100)
    throw new GroupAccessError(400, "Enter a valid numeric Telegram user ID and a name of up to 100 characters.");
  if (String(adminId) !== SYSTEM_ADMIN_TELEGRAM_ID) throw new GroupAccessError(403, "Only the system administrator can manage users.");
  if (userId === SYSTEM_ADMIN_TELEGRAM_ID) throw new GroupAccessError(400, "The system administrator always retains access.");
  if (stillAuthorized && !await stillAuthorized()) throw new GroupAccessError(401, "Your admin session expired. Sign in again.");
}

export function createMemoryUserAccessStore(): UserAccessStore {
  const rules = new Map<string, UserAccessRule>();
  return {
    async list() { return [...rules.values()].map(rule => ({ ...rule })); },
    async get(userId) { const rule = rules.get(userId); return rule && { ...rule }; },
    async set(userId, name, state, adminId, stillAuthorized) {
      await validateMutation(userId, name, state, adminId, stillAuthorized);
      if (state === "group") rules.delete(userId);
      else rules.set(userId, { userId, name: name.trim(), state });
    },
  };
}

export function createDatabaseUserAccessStore(query: DatabaseQuery): UserAccessStore {
  const run: DatabaseQuery = async (sql, values) => {
    try { return await query(sql, values); } catch { throw storageError(); }
  };
  const fromRow = (row: Record<string, unknown>): UserAccessRule => {
    if (typeof row.user_id !== "string" || !validUserId(row.user_id) || typeof row.name !== "string" || !["allowed", "blocked"].includes(String(row.state))) throw storageError();
    return { userId: row.user_id, name: row.name, state: row.state as UserAccessRule["state"] };
  };
  return {
    async list() {
      const result = await run("SELECT user_id::text, name, state FROM user_access ORDER BY name, user_id");
      return result.rows.map(fromRow);
    },
    async get(userId) {
      if (!validUserId(userId)) throw storageError();
      const result = await run("SELECT user_id::text, name, state FROM user_access WHERE user_id = $1", [userId]);
      return result.rows[0] && fromRow(result.rows[0]);
    },
    async set(userId, name, state, adminId, stillAuthorized) {
      await validateMutation(userId, name, state, adminId, stillAuthorized);
      if (state === "group") await run("DELETE FROM user_access WHERE user_id = $1", [userId]);
      else await run(`INSERT INTO user_access (user_id, name, state, updated_by) VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name, state = EXCLUDED.state,
        updated_by = EXCLUDED.updated_by, updated_at = now()`, [userId, name.trim(), state, adminId]);
    },
  };
}

export async function canViewEvents(userId: number, groups: GroupAccess, users: UserAccessStore): Promise<boolean> {
  const id = String(userId);
  const rule = await users.get(id);
  if (rule) return rule.state === "allowed";
  // Recheck after Telegram responds so a removal during its lookup also takes effect.
  const groupAccess = await groups.canViewEvents(userId);
  const current = await users.get(id);
  return current ? current.state === "allowed" : groupAccess;
}
