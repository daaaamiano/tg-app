import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, RefreshCw, ShieldCheck, UsersRound } from "lucide-react";
import { GroupMembers } from "./GroupMembers";
import { organizationRequest, privateServiceMode } from "../lib/organization";
import type { AuthorizedGroup } from "../types/group";

export function GroupApprovals({ onBack, onSessionInvalid }: { onBack: () => void; onSessionInvalid: () => void }) {
  const [allGroups, setAllGroups] = useState<AuthorizedGroup[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<"all" | "approved">("all");
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const approvedCount = allGroups.filter(group => group.approved).length;
  const groups = allGroups.filter(group => filter === "all" || group.approved);

  async function load() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true); setError("");
    try {
      const result = await organizationRequest<{ groups: AuthorizedGroup[] }>("groups", { signal: controller.signal });
      if (!controller.signal.aborted) setAllGroups(result.groups);
    } catch (cause) {
      if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : "Groups could not be loaded."); onSessionInvalid(); }
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }

  useEffect(() => { void load(); return () => request.current?.abort(); }, []);

  async function setApproval(chatId: string, approved: boolean) {
    setPending(chatId); setError(""); setMessage("");
    try {
      await organizationRequest("group-approval", { method: "POST", body: JSON.stringify({ chatId, approved }) });
      setAllGroups(previous => previous.map(group => group.chatId === chatId ? { ...group, approved } : group));
      const title = allGroups.find(group => group.chatId === chatId)?.title;
      setMessage(`${title}: ${approved ? "approved" : "approval revoked"}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The approval could not be saved."); onSessionInvalid(); }
    finally { setPending(null); }
  }

  return (
    <section className="groups-page" aria-labelledby="groups-title">
      <button className="text-link groups-back" onClick={onBack}>
        <ArrowLeft size={14} /> Back to the event
      </button>
      <div className="groups-heading">
        <div>
          <span className="eyebrow">SYSTEM ADMIN / GROUP ACCESS</span>
          <h1 id="groups-title">Your organization.</h1>
          <p>Approve a Telegram group to include everyone who belongs to it.</p>
        </div>
        <span className="group-count"><ShieldCheck size={17} /> {approvedCount} approved</span>
      </div>

      <aside className="groups-preview-note" aria-label="Group access policy">
        <span className="eyebrow">GROUP ACCESS</span>
        <p>{privateServiceMode ? "Approvals are saved for your organization. Access is checked against current Telegram group membership." : "Local development approvals last for this server session."}</p>
      </aside>

      <div className="groups-policy">
        <UsersRound size={23} />
        <div>
          <h2>One group approval. Everyone included.</h2>
          <p>Members of any approved group can view the events after signing in with Telegram. New members are included; people who leave lose access unless they belong to another approved group.</p>
        </div>
      </div>

      <div className="events-tabs" role="group" aria-label="Filter Telegram groups">
        <button className={filter === "all" ? "selected" : ""} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
          Known groups <span>{allGroups.length}</span>
        </button>
        <button className={filter === "approved" ? "selected" : ""} aria-pressed={filter === "approved"} onClick={() => setFilter("approved")}>
          Approved <span>{approvedCount}</span>
        </button>
      </div>

      <button className="text-link" disabled={loading || pending !== null} onClick={() => void load()}><RefreshCw size={14} /> Refresh groups</button>
      {loading && <p role="status">Checking Telegram groups…</p>}
      {error && <p className="error-message" role="alert">{error}</p>}
      <p className="groups-feedback" role="status" aria-live="polite">{message}</p>

      {groups.length ? (
        <ul className="group-list">
          {groups.map((group) => {
            const approved = group.approved;
            return (
              <li className={`group-card ${approved ? "group-approved" : ""}`} key={group.chatId}>
                <div className="group-card-heading">
                  <div className="group-avatar"><UsersRound size={22} /></div>
                  <div className="group-identity">
                    <h2>{group.title}</h2>
                    <p>Telegram group <span className="small-dot">·</span> {group.chatId}</p>
                  </div>
                  <span className={`group-badge ${approved ? "approved" : ""}`}>
                    {approved && <Check size={12} />} {approved ? "Approved" : "Not approved"}
                  </span>
                </div>
                <p className="group-access-description">
                  {approved ? group.botIsMember ? "Current members of this group can access your events." : "Approval is saved. Access is paused until the bot's group membership is verified." : "This group does not grant event access."}
                </p>
                {group.verificationError && <p className="error-message">{group.verificationError}</p>}
                <div className="group-card-footer">
                  <p className="group-bot-status">
                    <span>{group.botIsAdmin ? "Bot administrator verified" : group.botIsMember ? "Bot membership verified" : "Bot membership could not be verified"}</span>
                    <span>Checked {new Date(group.checkedAt).toLocaleString()}</span>
                    {group.botIsMember && !group.botIsAdmin && <span>Administrator rights improve membership-check reliability.</span>}
                  </p>
                  <button
                    className={approved ? "outline-button" : "primary-button"}
                    onClick={() => void setApproval(group.chatId, !approved)}
                    disabled={pending !== null || loading || (!approved && !group.botIsMember)}
                    aria-label={`${approved ? "Revoke approval for" : "Approve"} ${group.title}`}
                  >
                    {pending === group.chatId ? "Saving…" : approved ? "Revoke approval" : "Approve group"}
                    {approved ? <ArrowRight size={15} /> : <Check size={15} />}
                  </button>
                </div>
                <button
                  className="text-link group-members-toggle"
                  aria-expanded={expandedGroup === group.chatId}
                  aria-controls={`members-${group.chatId}`}
                  onClick={() => setExpandedGroup(expandedGroup === group.chatId ? null : group.chatId)}
                >
                  <UsersRound size={15} /> {expandedGroup === group.chatId ? "Hide members" : "View members"}
                </button>
                {expandedGroup === group.chatId && (
                  <div id={`members-${group.chatId}`}><GroupMembers chatId={group.chatId} onSessionInvalid={onSessionInvalid} /></div>
                )}
              </li>
            );
          })}
        </ul>
      ) : !loading && !error ? (
        <div className="empty-state archive-empty">
          <ShieldCheck size={28} />
          <h2>No approved groups yet.</h2>
          <p>Choose a group from Known groups to include its members.</p>
          <button className="text-link" onClick={() => setFilter("all")}>See known groups <ArrowRight size={14} /></button>
        </div>
      ) : null}

      <p className="events-footnote">@ropelab_bot · Add the bot to a group, then refresh to discover it.</p>
    </section>
  );
}
