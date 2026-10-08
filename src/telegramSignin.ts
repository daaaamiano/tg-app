import { openTelegramLogin, type TelegramLoginChallenge } from "./lib/telegramLoginPopup";

const signin = document.getElementById("signin") as HTMLButtonElement;
const signout = document.getElementById("signout") as HTMLButtonElement;
const status = document.getElementById("status")!;
const description = document.getElementById("description")!;
const main = document.querySelector("main")!;
let challenge: TelegramLoginChallenge | null = null;
let cancelPopup: (() => void) | undefined;

function setAuthenticating(authenticating: boolean) {
  main.classList.toggle("authenticating", authenticating);
  main.setAttribute("aria-busy", String(authenticating));
  signin.hidden = authenticating;
  description.textContent = authenticating
    ? "Please wait while we check your Telegram account."
    : "Sign in with Telegram to continue.";
  if (authenticating) status.textContent = "Authenticating with Telegram…";
}

async function api(route: string, options: RequestInit = {}) {
  const response = await fetch("/api/telegram/" + route, {
    ...options, credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Sign-in could not complete. Please try again.");
  return result;
}

async function prepare() {
  setAuthenticating(false);
  signin.disabled = true;
  signin.textContent = "Preparing Telegram sign-in…";
  try {
    const current = await api("session");
    signout.hidden = !current.session;
    if (current.session?.canViewEvents) { location.reload(); return; }
    if (current.session) status.textContent = "This account does not have access yet.";
    challenge = await api("login-challenge", { method: "POST" });
    signin.textContent = "Sign in with Telegram";
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "Sign-in could not be prepared.";
    signin.textContent = "Try again";
    challenge = null;
  }
  signin.disabled = false;
}

async function authenticate(proof: { idToken: string } | { initData: string }) {
  setAuthenticating(true);
  const result = await api("authenticate", { method: "POST", body: JSON.stringify(proof) });
  if (result.session.canViewEvents) { location.reload(); return; }
  setAuthenticating(false);
  status.textContent = "This account does not have access yet.";
  signout.hidden = false;
  challenge = null;
  signin.textContent = "Use another Telegram account";
  signin.disabled = false;
}

signin.onclick = () => {
  if (!challenge) { void prepare(); return; }
  cancelPopup?.();
  signin.disabled = true;
  setAuthenticating(true);
  cancelPopup = openTelegramLogin(challenge, async (result) => {
    try {
      if (!result.id_token) throw new Error(result.error || "Telegram sign-in could not complete. Please try again.");
      await authenticate({ idToken: result.id_token });
    } catch (error) {
      setAuthenticating(false);
      status.textContent = error instanceof Error ? error.message : "Telegram sign-in failed.";
      challenge = null;
      signin.textContent = "Try again";
      signin.disabled = false;
    }
  });
};
signout.onclick = async () => {
  try { cancelPopup?.(); await api("logout", { method: "POST" }); location.reload(); }
  catch (error) { status.textContent = error instanceof Error ? error.message : "Sign-out failed."; }
};

const initData = window.Telegram?.WebApp?.initData;
if (initData) {
  window.Telegram!.WebApp!.ready();
  void authenticate({ initData }).catch((error) => {
    status.textContent = error instanceof Error ? error.message : "Telegram sign-in failed.";
    void prepare();
  });
} else { status.textContent = ""; void prepare(); }
