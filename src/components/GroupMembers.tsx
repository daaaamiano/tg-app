import { useEffect, useRef, useState } from "react";
import { RefreshCw, Search, UsersRound } from "lucide-react";
import type { GroupRoster } from "../types/group";
import { organizationAuthAvailable, telegramApiPrefix } from "../lib/organization";

export function GroupMembers({ chatId, onSessionInvalid }: { chatId: string; onSessionInvalid: () => void }) {
  const [roster, setRoster] = useState<GroupRoster | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const request = useRef<AbortController | null>(null);

  async function load() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setError("");
    setRoster(null);
    if (!organizationAuthAvailable) {
      setError("Member viewing is available in the local preview. Admin sign-in is required before enabling it on the hosted site.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`${telegramApiPrefix}group-members?chatId=${encodeURIComponent(chatId)}`, {
        signal: controller.signal, cache: "no-store", credentials: "same-origin",
      });
      const result = await response.json();
      if (response.status === 401 || response.status === 403) onSessionInvalid();
      if (!response.ok) throw new Error(result.error ?? "The member list could not be loaded.");
      if (!controller.signal.aborted) setRoster(result as GroupRoster);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "The member list could not be loaded.");
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  useEffect(() => {
    void load();
    return () => request.current?.abort();
  }, [chatId]);

  const query = search.trim().toLowerCase();
  const members = roster?.members.filter((member) =>
    `${member.name} ${member.username ?? ""} ${member.id}`.toLowerCase().includes(query)
  ) ?? [];

  return (
    <section className="group-members" aria-label="Group members">
      <div className="group-members-heading">
        <h3><UsersRound size={16} /> Members</h3>
        <button className="text-link" onClick={() => void load()} disabled={busy}>
          <RefreshCw size={13} /> Refresh members
        </button>
      </div>
      {busy && <p className="member-note" role="status">Getting member names and Telegram IDs…</p>}
      {error && <p className="error-message" role="alert">{error}</p>}
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
                <thead><tr><th scope="col">Name</th><th scope="col">Telegram ID</th><th scope="col">Role</th></tr></thead>
                <tbody>
                  {members.map((member) => (
                    <tr key={member.id}>
                      <td><span className="member-name">{member.name} {member.isBot && <span className="member-bot-tag">Bot</span>}</span>{member.username && <span className="member-username">@{member.username}</span>}</td>
                      <td className="member-id">{member.id}</td>
                      <td className="member-role">{member.role}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="member-note">{query ? "No members match your search." : "No member identities are available yet."}</p>}
          <p className="member-note member-updated">Checked {new Date(roster.checkedAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}. Refresh to check for changes.</p>
        </>
      )}
    </section>
  );
}
