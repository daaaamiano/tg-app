import { useState } from "react";
import { UserPlus } from "lucide-react";
import { organizationRequest } from "../lib/organization";

export function UserAccess({ onSessionInvalid, onAdded }: { onSessionInvalid: () => void; onAdded: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [userId, setUserId] = useState("");
  const [name, setName] = useState("");
  const validId = /^[1-9]\d{0,15}$/.test(userId.trim()) && Number.isSafeInteger(Number(userId.trim()));

  async function add() {
    setPending(true); setError(""); setMessage("");
    try {
      await organizationRequest("user-access", { method: "POST", body: JSON.stringify({ userId: userId.trim(), name: name.trim(), state: "allowed" }) });
      setMessage(`Access added for ${name.trim() || userId.trim()}.`);
      setUserId(""); setName(""); onAdded();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "User access could not be saved."); onSessionInvalid(); }
    finally { setPending(false); }
  }

  return (
    <details className="user-access">
      <summary><UserPlus size={15} /> Add user by Telegram ID</summary>
      <p className="member-note">Give someone access without an approved group.</p>
      <form className="user-access-form" onSubmit={event => { event.preventDefault(); if (validId && !pending) void add(); }}>
        <label>Telegram user ID<input required inputMode="numeric" pattern="[1-9][0-9]{0,15}" placeholder="e.g. 123456789" value={userId} disabled={pending} onChange={event => setUserId(event.target.value)} /></label>
        <label>Name (optional)<input maxLength={100} placeholder="A name to recognize them" value={name} disabled={pending} onChange={event => setName(event.target.value)} /></label>
        <div className="user-access-actions"><button className="primary-button" type="submit" disabled={pending || !validId}><UserPlus size={15} /> {pending ? "Adding…" : "Add user"}</button></div>
      </form>
      {error && <p className="error-message" role="alert">{error}</p>}
      {message && <p className="member-note" role="status">{message}</p>}
    </details>
  );
}
