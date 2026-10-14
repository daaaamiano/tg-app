import { useEffect, useRef, useState } from "react";
import { RefreshCw, Search, UserPlus, UserMinus } from "lucide-react";
import { organizationRequest, privateServiceMode } from "../lib/organization";
import type { UserAccessRule, UserAccessState } from "../types/userAccess";

export function UserAccess({ onSessionInvalid }: { onSessionInvalid: () => void }) {
  const [users, setUsers] = useState<UserAccessRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [userId, setUserId] = useState("");
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const request = useRef<AbortController | null>(null);

  async function load() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true); setError("");
    try {
      const result = await organizationRequest<{ users: UserAccessRule[] }>("users", { signal: controller.signal });
      if (!controller.signal.aborted) setUsers(result.users);
    } catch (cause) {
      if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : "Users could not be loaded."); onSessionInvalid(); }
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }

  useEffect(() => { void load(); return () => request.current?.abort(); }, []);

  async function save(id: string, label: string, state: UserAccessState) {
    setPending(true); setError(""); setMessage("");
    try {
      await organizationRequest("user-access", { method: "POST", body: JSON.stringify({ userId: id, name: label, state }) });
      setUsers(previous => {
        const others = previous.filter(user => user.userId !== id);
        return state === "group" ? others : [...others, { userId: id, name: label, state }];
      });
      setMessage(`${label || id}: ${state === "allowed" ? "access added" : state === "blocked" ? "access removed" : "group access restored"}.`);
      setUserId(""); setName("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "User access could not be saved."); onSessionInvalid(); }
    finally { setPending(false); }
  }

  const query = search.trim().toLowerCase();
  const visible = users.filter(user => `${user.name} ${user.userId}`.toLowerCase().includes(query))
    .sort((a, b) => (a.name || a.userId).localeCompare(b.name || b.userId));
  const validId = /^[1-9]\d{0,15}$/.test(userId.trim()) && Number.isSafeInteger(Number(userId.trim()));
  const disabled = pending || loading;

  return (
    <section className="user-access" aria-labelledby="user-access-title">
      <div className="group-members-heading">
        <h2 id="user-access-title">Individual users</h2>
        <button className="text-link" disabled={disabled} onClick={() => void load()}><RefreshCw size={14} /> Refresh users</button>
      </div>
      <p className="member-note">Add someone to give them access without joining a group. Remove access to exclude them from all events, including through approved groups. Users still sign in with Telegram.</p>
      {!privateServiceMode && <p className="member-note">Local changes last until this development server restarts.</p>}
      <form className="user-access-form" onSubmit={event => { event.preventDefault(); if (validId && !disabled) void save(userId.trim(), name.trim(), "allowed"); }}>
        <label>Telegram user ID<input required inputMode="numeric" pattern="[1-9][0-9]{0,15}" placeholder="e.g. 123456789" value={userId} disabled={disabled} onChange={event => setUserId(event.target.value)} aria-describedby="user-id-help" /></label>
        <label>Name (optional)<input maxLength={100} placeholder="A name to recognize them" value={name} disabled={disabled} onChange={event => setName(event.target.value)} /></label>
        <div className="user-access-actions">
          <button className="primary-button" type="submit" disabled={disabled || !validId}><UserPlus size={15} /> Add user</button>
          <button className="outline-button" type="button" disabled={disabled || !validId} onClick={() => void save(userId.trim(), name.trim(), "blocked")}><UserMinus size={15} /> Remove access</button>
        </div>
      </form>
      <p className="member-note" id="user-id-help">Use their numeric Telegram ID from a group’s member list. Names are labels; usernames cannot be used as IDs.</p>
      {loading && <p role="status" className="member-note">Loading users…</p>}
      {pending && <p role="status" className="member-note">Saving user access…</p>}
      {error && <p className="error-message" role="alert">{error}</p>}
      <p className="groups-feedback" role="status" aria-live="polite">{message}</p>
      <label className="member-search"><Search size={15} /><input type="search" aria-label="Search individual users" placeholder="Search name or Telegram ID" value={search} onChange={event => setSearch(event.target.value)} /></label>
      {visible.length ? (
        <ul className="user-access-list">
          {visible.map(user => (
            <li className="user-access-row" key={user.userId}>
              <div><span className="member-name">{user.name || "Telegram user"}</span><span className="member-username">{user.userId}</span></div>
              <span className={`group-badge ${user.state === "allowed" ? "approved" : ""}`}>{user.state === "allowed" ? "Access added" : "Access removed"}</span>
              <div className="user-access-actions">
                <button className="outline-button" disabled={disabled} aria-label={`${user.state === "allowed" ? "Remove access for" : "Add access for"} ${user.name || user.userId}`} onClick={() => void save(user.userId, user.name, user.state === "allowed" ? "blocked" : "allowed")}>{user.state === "allowed" ? "Remove access" : "Add user"}</button>
                <button className="text-link" disabled={disabled} aria-label={`Use group rules for ${user.name || user.userId}`} onClick={() => void save(user.userId, user.name, "group")}>Use group rules</button>
              </div>
            </li>
          ))}
        </ul>
      ) : !loading && !error && <p className="member-note">{query ? "No users match your search." : "No individual access decisions yet. Add a Telegram ID above to manage someone directly."}</p>}
      <p className="member-note">Use group rules clears your individual decision. The person then has access only through an approved group. Your administrator access is always retained.</p>
    </section>
  );
}
