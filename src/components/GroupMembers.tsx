import { useEffect, useRef, useState } from "react";
import { RefreshCw, Search, UsersRound } from "lucide-react";
import type { GroupMember, GroupRoster } from "../types/group";
import type { UserAccessRule } from "../types/userAccess";
import { organizationAuthAvailable, organizationRequest } from "../lib/organization";

export function GroupMembers({ chatId, approved, adminUserId, userAccessVersion, onSessionInvalid }: { chatId: string; approved: boolean; adminUserId: string; userAccessVersion: number; onSessionInvalid: () => void }) {
  const [roster, setRoster] = useState<GroupRoster | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [rules, setRules] = useState<UserAccessRule[]>([]);
  const [accessReady, setAccessReady] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const request = useRef<AbortController | null>(null);

  async function load() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setError("");
    setRoster(null);
    setAccessReady(false);
    setMessage("");
    if (!organizationAuthAvailable) {
      setError("Member viewing is available in the local preview. Admin sign-in is required before enabling it on the hosted site.");
      return;
    }
    setBusy(true);
    try {
      const results = await Promise.allSettled([
        organizationRequest<GroupRoster>(`group-members?chatId=${encodeURIComponent(chatId)}`, { signal: controller.signal }),
        organizationRequest<{ users: UserAccessRule[] }>("users", { signal: controller.signal }),
      ]);
      if (controller.signal.aborted) return;
      if (results[0].status === "fulfilled") setRoster(results[0].value);
      if (results[1].status === "fulfilled") { setRules(results[1].value.users); setAccessReady(true); }
      const failure = results.find(result => result.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
    } catch (cause) {
      if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : "The member list could not be loaded."); onSessionInvalid(); }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  useEffect(() => {
    void load();
    return () => request.current?.abort();
  }, [chatId, userAccessVersion]);

  async function setAccess(member: GroupMember, blocked: boolean) {
    setPending(member.id); setError(""); setMessage("");
    const state = blocked ? "blocked" : "allowed";
    try {
      await organizationRequest("user-access", { method: "POST", body: JSON.stringify({ userId: member.id, name: member.name.slice(0, 100), state }) });
      setRules(previous => [...previous.filter(rule => rule.userId !== member.id), { userId: member.id, name: member.name, state }]);
      setMessage(`${member.name}: access ${blocked ? "removed" : "restored"}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "User access could not be saved."); onSessionInvalid(); }
    finally { setPending(null); }
  }

  const query = search.trim().toLowerCase();
  const members = roster?.members.filter((member) =>
    `${member.name} ${member.username ?? ""} ${member.id}`.toLowerCase().includes(query)
  ) ?? [];

  return (
    <section className="group-members" aria-label="Group members">
      <div className="group-members-heading">
        <h3><UsersRound size={16} /> Members</h3>
        <button className="text-link" onClick={() => void load()} disabled={busy || pending !== null}>
          <RefreshCw size={13} /> Refresh members
        </button>
      </div>
      {busy && <p className="member-note" role="status">Getting member names and Telegram IDs…</p>}
      {error && <p className="error-message" role="alert">{error}</p>}
      {message && <p className="member-note" role="status">{message}</p>}
      {roster && (
        <>
          <p className="member-note" role="status">
            {roster.complete ? `All ${roster.totalMembers} members identified` : `${roster.members.length} of ${roster.totalMembers} members identified · Incomplete list`}. Includes bots.
          </p>
          {roster.notice && <p className="member-coverage-note">{roster.notice}</p>}
          <label className="member-search">
            <Search size={15} />
            <input type="search" aria-label="Search members by name, username or ID" placeholder="Search name, username or ID" value={search} onChange={(event) => setSearch(event.target.value)} />
          </label>
          {members.length ? (
            <div className="member-table-scroll">
              <table className="member-table">
                <caption className="visually-hidden">Member names and Telegram IDs for {roster.title}</caption>
                <thead><tr><th scope="col">Member</th><th scope="col">Event access</th></tr></thead>
                <tbody>
                  {members.map((member) => {
                    const rule = rules.find(rule => rule.userId === member.id);
                    const admin = member.id === adminUserId;
                    const blocked = rule?.state === "blocked";
                    const allowed = admin || rule?.state === "allowed" || (approved && !blocked);
                    return (
                    <tr key={member.id}>
                      <td><span className="member-name">{member.name} {member.isBot && <span className="member-bot-tag">Bot</span>}</span><span className="member-username">{member.username && `@${member.username} · `}{member.id} · {member.role}</span></td>
                      <td className="member-access">
                        {member.isBot ? <span className="member-note">Bot</span> : admin ? <span className="member-note">System admin</span> : (
                          <><span className="member-access-status">{accessReady ? blocked ? "Removed" : allowed ? "Allowed" : "Group not approved" : "Unavailable"}</span><button className="text-link" disabled={busy || !accessReady || pending !== null} aria-label={`${allowed ? "Remove access for" : "Restore access for"} ${member.name}`} onClick={() => void setAccess(member, allowed)}>{pending === member.id ? "Saving…" : allowed ? "Remove access" : "Restore access"}</button></>
                        )}
                      </td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            </div>
          ) : <p className="member-note">{query ? "No members match your search." : "No member identities are available yet."}</p>}
          <p className="member-note member-updated">Checked {new Date(roster.checkedAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}. Refresh to check for changes.</p>
          <p className="member-note">Removal blocks all event invitations, including through other groups. Allowed access does not confirm attendance.</p>
        </>
      )}
    </section>
  );
}
