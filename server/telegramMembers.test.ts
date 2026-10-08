import { describe, expect, it, vi } from "vitest";
import { isCurrentMember, loadGroupRoster, type BotUser } from "./telegramMembers";

const owner: BotUser = { id: 1, first_name: "Owner", is_bot: false };
const bot: BotUser = { id: 2, first_name: "Bot", is_bot: true };
const departed: BotUser = { id: 3, first_name: "Former member", is_bot: false };

describe("Telegram member roster", () => {
  it("includes restricted users only when still in the group", () => {
    expect(isCurrentMember({ user: owner, status: "restricted", is_member: true })).toBe(true);
    for (const status of ["left", "kicked", "restricted", "unknown"])
      expect(isCurrentMember({ user: owner, status })).toBe(false);
  });

  it("flags missing members and omits departed members and unrelated groups", async () => {
    const api = vi.fn(async (method: string, body?: object) => {
      if (method === "getChat") return { id: -10, title: "Group" };
      if (method === "getChatMemberCount") return 4;
      if (method === "getMe") return bot;
      if (method === "getChatAdministrators") return [{ user: owner, status: "creator" }];
      if (method === "getWebhookInfo") return { url: "" };
      if (method === "getUpdates") return [
        { message: { chat: { id: -10 }, from: departed } },
        { message: { chat: { id: -999 }, from: { ...owner, id: 99 } } },
      ];
      if (method === "getChatMember") {
        const id = (body as { user_id: number }).user_id;
        return { user: id === 1 ? owner : id === 2 ? bot : departed, status: id === 1 ? "creator" : id === 2 ? "member" : "left" };
      }
      throw new Error("Unexpected method");
    });
    const roster = await loadGroupRoster({ token: "test", chatId: "-10" }, api as Parameters<typeof loadGroupRoster>[1]);
    expect(roster.complete).toBe(false);
    expect(roster.members.map((member) => member.id)).toEqual(["1", "2"]);
    expect(roster.notice).toContain("API ID");
    expect(api).toHaveBeenCalledWith("getUpdates", { timeout: 0, limit: 100 });
    expect(api).not.toHaveBeenCalledWith("getChatMember", { chat_id: "-10", user_id: 99 });
  });

  it("does not poll or change an existing webhook", async () => {
    const api = vi.fn(async (method: string) => {
      const values: Record<string, unknown> = {
        getChat: { id: -10, title: "Group" }, getChatMemberCount: 1, getMe: bot,
        getChatAdministrators: [], getWebhookInfo: { url: "https://example.com/hook" },
        getChatMember: { user: bot, status: "member" },
      };
      if (!(method in values)) throw new Error("Unexpected method");
      return values[method];
    });
    const roster = await loadGroupRoster({ token: "test", chatId: "-10" }, api as Parameters<typeof loadGroupRoster>[1]);
    expect(roster.complete).toBe(true);
    expect(roster.notice).toBeUndefined();
    expect(api.mock.calls.map(([method]) => method)).not.toContain("getUpdates");
  });
});
