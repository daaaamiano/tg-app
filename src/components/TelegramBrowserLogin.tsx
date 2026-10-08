import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Send } from "lucide-react";
import { organizationRequest } from "../lib/organization";
import { openTelegramLogin } from "../lib/telegramLoginPopup";

export function TelegramBrowserLogin({ onAuthenticate }: { onAuthenticate: (proof: { idToken: string }) => Promise<void> }) {
  const [challenge, setChallenge] = useState<{ clientId: number; nonce: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const cancelPopup = useRef<(() => void) | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setError(""); setChallenge(null);
    // Prepare before the click so opening the popup retains browser user activation.
    organizationRequest<{ clientId: number; nonce: string }>("login-challenge", { method: "POST", signal: controller.signal })
      .then((value) => { if (active) setChallenge(value); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Telegram sign-in could not be prepared."); });
    return () => { active = false; controller.abort(); cancelPopup.current?.(); };
  }, [attempt]);

  function signIn() {
    if (!challenge) return;
    cancelPopup.current?.();
    setBusy(true); setError("");
    cancelPopup.current = openTelegramLogin(challenge, async (result) => {
      try {
        if (!result.id_token) throw new Error(result.error ?? "Telegram sign-in was cancelled.");
        await onAuthenticate({ idToken: result.id_token });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Telegram sign-in failed.");
        setChallenge(null);
      } finally { setBusy(false); }
    });
  }

  return (
    <div>
      <button className="outline-button full-width" disabled={busy || !challenge} onClick={signIn}>
        <Send size={16} /> {busy ? "Verifying Telegram…" : challenge ? "Sign in with Telegram" : "Preparing Telegram sign-in…"} <ArrowUpRight size={16} />
      </button>
      {error && <><p className="error-message" role="alert">{error}</p><button className="text-link" onClick={() => setAttempt((value) => value + 1)}>Try Telegram sign-in again</button></>}
    </div>
  );
}
