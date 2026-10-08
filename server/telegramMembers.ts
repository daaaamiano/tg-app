import { Api, TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions";
import { returnBigInt } from "teleproto/Helpers";
import { LogLevel } from "teleproto/extensions/Logger";
import type { GroupMember, GroupRoster } from "../src/types/group";

export interface BotUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  is_bot: boolean;
}
interface Membership {
  user: BotUser;
  status: string;
  is_member?: boolean;
}
interface BotUpdate {
  message?: { chat: { id: number }; from?: BotUser; new_chat_members?: BotUser[] };
  chat_member?: { chat: { id: number }; new_chat_member: Membership };
  my_chat_member?: { chat: { id: number }; new_chat_member: Membership };
}
export interface TelegramConfig {
  token: string;
  chatId: string;
  apiId?: number;
  apiHash?: string;
}
type BotApi = <T>(method: string, body?: object) => Promise<T>;
let mtprotoSession: { key: string; session: StringSession } | undefined;

export function isCurrentMember(member: Membership): boolean {
  return ["creator", "administrator", "member"].includes(member.status) ||
    (member.status === "restricted" && member.is_member === true);
}

function fromBotMember(member: Membership): GroupMember {
  const user = member.user;
  return {
    id: String(user.id),
    name: [user.first_name, user.last_name].filter(Boolean).join(" ") || "Name unavailable",
    username: user.username,
    isBot: user.is_bot,
    role: member.status === "creator" ? "owner" : member.status === "administrator" ? "administrator" : "member",
  };
}

export async function loadKnownMembers(api: BotApi, chatId: string): Promise<GroupMember[]> {
  const bot = await api<BotUser>("getMe");
  const admins = await api<Membership[]>("getChatAdministrators", { chat_id: chatId, return_bots: true });
  const candidates = new Map<number, BotUser>(admins.map((member) => [member.user.id, member.user]));
  candidates.set(bot.id, bot);
  const webhook = await api<{ url: string }>("getWebhookInfo");
  if (!webhook.url) {
    // No offset/allowed_updates: do not confirm updates or alter update subscriptions.
    const updates = await api<BotUpdate[]>("getUpdates", { timeout: 0, limit: 100 });
    for (const update of updates) {
      const message = update.message;
      if (message && String(message.chat.id) === chatId) {
        for (const user of [message.from, ...(message.new_chat_members ?? [])])
          if (user) candidates.set(user.id, user);
      }
      for (const change of [update.chat_member, update.my_chat_member])
        if (change && String(change.chat.id) === chatId)
          candidates.set(change.new_chat_member.user.id, change.new_chat_member.user);
    }
  }
  const members: GroupMember[] = [];
  for (const user of candidates.values()) {
    const current = await api<Membership>("getChatMember", { chat_id: chatId, user_id: user.id });
    if (isCurrentMember(current)) members.push(fromBotMember(current));
  }
  return members;
}

async function loadFullMembers(config: TelegramConfig): Promise<GroupMember[]> {
  const key = `${config.apiId}:${config.apiHash}:${config.token}`;
  if (mtprotoSession?.key !== key) mtprotoSession = { key, session: new StringSession("") };
  const client = new TelegramClient(mtprotoSession.session, config.apiId!, config.apiHash!, {
    connectionRetries: 1, requestRetries: 3, timeout: 8, floodSleepThreshold: 0, autoReconnect: false,
  });
  client.setLogLevel(LogLevel.NONE);
  const timer = setTimeout(() => { void client.disconnect(); }, 45000);
  try {
    await client.connect();
    if (!await client.isUserAuthorized())
      await client.signInBot({ apiId: config.apiId!, apiHash: config.apiHash! }, { botAuthToken: config.token });
    // GramJS-compatible client paginates channels; basic groups use messages.getFullChat.
    const participants = await client.getParticipants(returnBigInt(config.chatId));
    return participants.map((user) => {
      const participant = user.participant;
      return {
        id: user.id.toString(),
        name: [user.firstName, user.lastName].filter(Boolean).join(" ") || (user.deleted ? "Deleted account" : "Name unavailable"),
        username: user.username || undefined,
        isBot: Boolean(user.bot),
        role: participant instanceof Api.ChatParticipantCreator || participant instanceof Api.ChannelParticipantCreator
          ? "owner"
          : participant instanceof Api.ChatParticipantAdmin || participant instanceof Api.ChannelParticipantAdmin
          ? "administrator" : "member",
      };
    });
  } finally {
    clearTimeout(timer);
    await client.destroy();
  }
}

export async function loadGroupRoster(config: TelegramConfig, apiOverride?: BotApi): Promise<GroupRoster> {
  const signal = AbortSignal.timeout(60000);
  const api: BotApi = apiOverride ?? (async <T>(method: string, body: object = {}): Promise<T> => {
    let response: Response;
    try {
      response = await fetch(`https://api.telegram.org/bot${config.token}/${method}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]),
      });
    } catch { throw new Error("Telegram could not be reached. Try again."); }
    const data = await response.json() as { ok: boolean; result: T };
    if (!data.ok) throw new Error("Telegram could not verify this group. Check the bot's membership and permissions.");
    return data.result;
  });
  const chat = await api<{ id: number; title: string }>("getChat", { chat_id: config.chatId });
  let members: GroupMember[];
  let source: GroupRoster["source"] = "bot-api";
  let notice: string | undefined;
  if (config.apiId && config.apiHash) {
    try {
      members = await loadFullMembers(config);
      source = "mtproto";
    } catch {
      notice = "The complete list could not be retrieved. Check the Telegram API credentials and bot permissions, then retry. Showing members known to the bot.";
      members = await loadKnownMembers(api, config.chatId);
    }
  } else {
    members = await loadKnownMembers(api, config.chatId);
    notice = "Complete member retrieval needs a Telegram API ID and API hash. The Bot API can only identify members it has seen and group administrators.";
  }
  const totalMembers = await api<number>("getChatMemberCount", { chat_id: config.chatId });
  members = [...new Map(members.map((member) => [member.id, member])).values()]
    .sort((left, right) => Number(left.isBot) - Number(right.isBot) || left.name.localeCompare(right.name));
  const complete = members.length === totalMembers;
  if (complete) notice = undefined;
  else if (source === "mtproto") notice = "Telegram returned fewer identities than the group's member count. Some members may be hidden, or membership may have changed during retrieval. This list is incomplete.";
  return { chatId: String(chat.id), title: chat.title, totalMembers, members, complete, source, notice, checkedAt: new Date().toISOString() };
}
