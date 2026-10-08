export interface TelegramLoginChallenge { clientId: number; nonce: string }
export interface TelegramLoginResult { id_token?: string; error?: string }

// Telegram's post_message flow requires origin even though the current SDK omits it.
// The returned token is always verified on the server against the one-use nonce.
export function openTelegramLogin(challenge: TelegramLoginChallenge, callback: (result: TelegramLoginResult) => void): () => void {
  const telegramOrigin = "https://oauth.telegram.org";
  const url = new URL("/auth", telegramOrigin);
  url.search = new URLSearchParams({
    response_type: "post_message", client_id: String(challenge.clientId),
    origin: window.location.origin, redirect_uri: window.location.origin + window.location.pathname,
    scope: "openid profile", nonce: challenge.nonce,
  }).toString();
  let finished = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let popup: Window | null = null;
  const cleanup = () => {
    window.removeEventListener("message", receive);
    if (timer !== undefined) clearInterval(timer);
  };
  const finish = (result: TelegramLoginResult) => {
    if (finished) return;
    finished = true;
    cleanup();
    callback(result);
  };
  const receive = (event: MessageEvent) => {
    if (!popup || event.origin !== telegramOrigin || event.source !== popup) return;
    let data;
    try { data = typeof event.data === "string" ? JSON.parse(event.data) : event.data; } catch { return; }
    if (!data || data.event !== "auth_result") return;
    finish(typeof data.result === "string" && data.result
      ? { id_token: data.result }
      : { error: typeof data.error === "string" ? data.error : "Telegram sign-in could not complete. Please try again." });
  };
  window.addEventListener("message", receive);
  try { popup = window.open(url.toString(), "telegram_oidc_login", "popup,width=550,height=650"); }
  catch { /* Report blocked popups through the normal callback. */ }
  if (!popup) finish({ error: "Allow popups for this site, then try Telegram sign-in again." });
  else {
    const deadline = Date.now() + 300000;
    timer = setInterval(() => {
      if (popup?.closed) finish({ error: "Telegram sign-in was cancelled. Please try again." });
      else if (Date.now() >= deadline) finish({ error: "Telegram sign-in timed out. Please try again." });
    }, 250);
  }
  return () => { finished = true; cleanup(); popup?.close(); };
}
