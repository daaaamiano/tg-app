import type { AuthorizedGroup } from "../src/types/group";
import type { DatabaseQuery } from "./authStorage";
import type { TelegramServerConfig } from "./telegramConfig";
import { isCurrentMember } from "./telegramMembers";

export class GroupAccessError extends Error {
  constructor(public status = 503, message = "Telegram group access is temporarily unavailable. Please try again.") { super(message); }
}
class BotRemovedError extends GroupAccessError {}
interface StoredGroup { chatId: string; title: string; approved: boolean }
export interface GroupStore {
  list(): Promise<StoredGroup[]>;
  discover(chatId: string, title: string): Promise<void>;
  remove(chatId: string): Promise<void>;
  setApproval(chatId: string, approved: boolean, adminId: number, stillAuthorized?: () => Promise<boolean>): Promise<void>;
}
export interface GroupAccess {
  list(): Promise<AuthorizedGroup[]>;
  setApproval(chatId: string, approved: boolean, adminId: number, stillAuthorized?: () => Promise<boolean>): Promise<void>;
  hasGroup(chatId: string): Promise<boolean>;
  canViewEvents(userId: number): Promise<boolean>;
}
type BotApi = <T>(method: string, body?: object) => Promise<T>;
interface Member { status: string; is_member?: boolean; user: { id: number; first_name: string; is_bot: boolean } }
const validChatId = (id: string) => /^-[1-9]\d{0,15}$/.test(id) && Number.isSafeInteger(Number(id));

export function createDatabaseGroupStore(query: DatabaseQuery): GroupStore {
  const run: DatabaseQuery = async (sql, values) => {
    try { return await query(sql, values); } catch { throw new GroupAccessError(); }
  };
  return {
    async list() {
      const result = await run("SELECT chat_id::text, title, approved FROM approved_groups ORDER BY title, chat_id");
      return result.rows.map(row => {
        if (typeof row.chat_id !== "string" || !validChatId(row.chat_id) || typeof row.title !== "string" || typeof row.approved !== "boolean") throw new GroupAccessError();
        return { chatId: row.chat_id, title: row.title, approved: row.approved };
      });
    },
    async discover(chatId, title) {
      await run("INSERT INTO approved_groups (chat_id, title) VALUES ($1, $2) ON CONFLICT (chat_id) DO UPDATE SET title = EXCLUDED.title", [chatId, title]);
    },
    async remove(chatId) { await run("DELETE FROM approved_groups WHERE chat_id = $1", [chatId]); },
    async setApproval(chatId, approved, adminId, stillAuthorized) {
      if (stillAuthorized && !await stillAuthorized()) throw new GroupAccessError(401, "Your admin session expired. Sign in again.");
      const result = await run("UPDATE approved_groups SET approved = $2, updated_by = $3, updated_at = now() WHERE chat_id = $1 RETURNING chat_id", [chatId, approved, adminId]);
      if (!result.rows.length) throw new GroupAccessError(404, "This group is not known to the bot.");
    },
  };
}

export function createMemoryGroupStore(): GroupStore {
  const groups = new Map<string, StoredGroup>();
  return {
    async list() { return [...groups.values()].map(group => ({ ...group })); },
    async discover(chatId, title) { groups.set(chatId, { chatId, title, approved: groups.get(chatId)?.approved ?? false }); },
    async remove(chatId) { groups.delete(chatId); },
    async setApproval(chatId, approved) {
      const group = groups.get(chatId);
      if (!group) throw new GroupAccessError(404, "This group is not known to the bot.");
      group.approved = approved;
    },
  };
}

export function createGroupAccess(store: GroupStore, configReader: () => TelegramServerConfig, apiOverride?: BotApi): GroupAccess {
  const api: BotApi = apiOverride ?? (async <T>(method: string, body: object = {}): Promise<T> => {
    try {
      const response = await fetch(`https://api.telegram.org/bot${configReader().token}/${method}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(12000),
      });
      const data = await response.json() as { ok: boolean; result: T; error_code?: number; description?: string };
      if (!data.ok) {
        // Only explicit group departure errors justify deleting saved approvals.
        if (["getChat", "getChatMember"].includes(method) && data.error_code === 403 &&
            /^Forbidden: bot (?:was kicked from|is not a member of) the (?:super)?group chat$/i.test(data.description ?? ""))
          throw new BotRemovedError();
        throw new GroupAccessError();
      }
      return data.result;
    } catch (cause) {
      if (cause instanceof GroupAccessError) throw cause;
      throw new GroupAccessError();
    }
  });
  const botMembership = async (chatId: string, botId: number) => {
    const member = await api<Member>("getChatMember", { chat_id: chatId, user_id: botId });
    const identityMatches = member.user?.id === botId && member.user.is_bot === true;
    if (identityMatches && (["left", "kicked"].includes(member.status) || (member.status === "restricted" && member.is_member === false)))
      throw new BotRemovedError();
    return { botIsAdmin: identityMatches && ["creator", "administrator"].includes(member.status), botIsMember: identityMatches && isCurrentMember(member) };
  };
  return {
    async list() {
      const stored = await store.list();
      const ids = new Set([configReader().chatId]);
      let bot: { id: number } | undefined;
      try {
        bot = await api<{ id: number }>("getMe");
        const webhook = await api<{ url: string }>("getWebhookInfo");
        if (!webhook.url) {
          // Observe pending updates without acknowledging them or changing webhook settings.
          const updates = await api<Array<{ message?: { chat: { id: number; type: string } }; my_chat_member?: { chat: { id: number; type: string } } }>>("getUpdates", { timeout: 0, limit: 100 });
          for (const update of updates) for (const chat of [update.message?.chat, update.my_chat_member?.chat])
            if (chat && ["group", "supergroup"].includes(chat.type) && validChatId(String(chat.id))) ids.add(String(chat.id));
        }
      } catch { /* Stored approvals can still be reviewed and revoked during an outage. */ }
      for (const group of stored) ids.add(group.chatId);
      const checkedAt = new Date().toISOString();
      const removed = new Set<string>();
      const metadata = new Map<string, { title: string; botIsAdmin: boolean; botIsMember: boolean }>();
      const discovered = await Promise.all([...ids].slice(0, 20).map(async (chatId) => {
        if (!bot) return;
        try {
          const membership = await botMembership(chatId, bot.id);
          const chat = await api<{ id: number; type: string; title: string }>("getChat", { chat_id: chatId });
          if (String(chat.id) !== chatId || !validChatId(String(chat.id)) || !["group", "supergroup"].includes(chat.type) || typeof chat.title !== "string") return;
          metadata.set(chatId, { title: chat.title, ...membership });
          return { chatId, title: chat.title };
        } catch (cause) {
          if (cause instanceof BotRemovedError) removed.add(chatId);
          // Other failures leave known groups revocable during a Telegram outage.
        }
      }));
      for (const chatId of removed) await store.remove(chatId);
      for (const group of discovered) if (group) await store.discover(group.chatId, group.title);
      return (await store.list()).map(group => ({ ...group, checkedAt, botIsAdmin: metadata.get(group.chatId)?.botIsAdmin ?? false,
        botIsMember: metadata.get(group.chatId)?.botIsMember ?? false,
        verificationError: metadata.has(group.chatId) ? undefined : "Telegram could not verify this group. Check the bot's membership, then refresh." }));
    },
    async hasGroup(chatId) { return validChatId(chatId) && (await store.list()).some(group => group.chatId === chatId); },
    async setApproval(chatId, approved, adminId, stillAuthorized) {
      if (!validChatId(chatId)) throw new GroupAccessError(400, "Choose a valid Telegram group.");
      if (!(await store.list()).some(group => group.chatId === chatId)) throw new GroupAccessError(404, "This group is not known to the bot.");
      if (approved) {
        const bot = await api<{ id: number }>("getMe");
        let botIsMember = false;
        try { botIsMember = (await botMembership(chatId, bot.id)).botIsMember; }
        catch (cause) {
          if (!(cause instanceof BotRemovedError)) throw cause;
          await store.remove(chatId);
        }
        if (!botIsMember) throw new GroupAccessError(409, "Add the bot to this Telegram group before approving it.");
      }
      // Revocation does not depend on Telegram being reachable.
      if (stillAuthorized && !await stillAuthorized()) throw new GroupAccessError(401, "Your admin session expired. Sign in again.");
      await store.setApproval(chatId, approved, adminId, stillAuthorized);
    },
    async canViewEvents(userId) {
      const groups = (await store.list()).filter(group => group.approved);
      if (!groups.length) return false;
      const bot = await api<{ id: number }>("getMe");
      let unavailable = false;
      const deadline = Date.now() + 45000;
      for (const group of groups) {
        if (Date.now() > deadline) throw new GroupAccessError();
        try {
          if (!(await botMembership(group.chatId, bot.id)).botIsMember) continue;
          const member = await api<Member>("getChatMember", { chat_id: group.chatId, user_id: userId });
          if (member.user?.id === userId && !member.user.is_bot && isCurrentMember(member) &&
              (await store.list()).some(current => current.chatId === group.chatId && current.approved)) return true;
        } catch (cause) {
          if (cause instanceof BotRemovedError) await store.remove(group.chatId);
          else unavailable = true;
        }
      }
      if (unavailable) throw new GroupAccessError();
      return false;
    },
  };
}
