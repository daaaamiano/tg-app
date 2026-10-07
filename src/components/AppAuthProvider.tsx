import { AuthKitProvider, useAuth } from "@workos-inc/authkit-react";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getWebAuthConfig, toWebSession } from "../lib/authkit";
import { isInTelegram } from "../lib/telegram";
import type { AuthSession } from "../types/event";

interface WebAccount {
  available: boolean;
  isLoading: boolean;
  session: AuthSession | null;
  error: string;
  signIn(): Promise<void>;
  signUp(): Promise<void>;
  signOut(): Promise<void>;
  getAccessToken(): Promise<string>;
}

const unavailable: WebAccount = {
  available: false,
  isLoading: false,
  session: null,
  error: "Web sign-in is coming soon. You can explore the demo below.",
  signIn: async () => {
    throw new Error("Web sign-in is not configured yet.");
  },
  signUp: async () => {
    throw new Error("Web sign-in is not configured yet.");
  },
  signOut: async () => {},
  getAccessToken: async () => {
    throw new Error("Sign in before making an authenticated request.");
  },
};
const WebAccountContext = createContext<WebAccount>(unavailable);
export const useWebAccount = () => useContext(WebAccountContext);

function WebAccountBridge({ children }: { children: ReactNode }) {
  const { user, isLoading, signIn, signUp, signOut, getAccessToken } =
    useAuth();
  const [error, setError] = useState(() =>
    new URLSearchParams(window.location.search).has("error")
      ? "Sign-in could not complete. Please try again."
      : ""
  );
  const initiated = useRef(false);

  // WorkOS uses this route for invitation/password-reset links that need a fresh PKCE flow.
  useEffect(() => {
    if (isLoading || window.location.pathname !== "/login" || initiated.current)
      return;
    initiated.current = true;
    if (user) {
      window.history.replaceState({}, "", "/");
      return;
    }
    signIn().catch(() => setError("Could not open sign-in. Please try again."));
  }, [isLoading, user, signIn]);

  return (
    <WebAccountContext.Provider
      value={{
        available: true,
        isLoading,
        session: user ? toWebSession(user) : null,
        error,
        signIn: () => signIn(),
        signUp: () => signUp(),
        signOut: async () => {
          await signOut({ returnTo: `${window.location.origin}/` });
        },
        getAccessToken: () => getAccessToken(),
      }}
    >
      {children}
    </WebAccountContext.Provider>
  );
}

export function AppAuthProvider({ children }: { children: ReactNode }) {
  const config = getWebAuthConfig(import.meta.env, import.meta.env.DEV);
  const inFrame = window.self !== window.top;
  // Telegram keeps its own launch-data flow; AuthKit's client SDK requires a top-level browser.
  if (isInTelegram() || inFrame || config.error) {
    const error =
      inFrame && !isInTelegram()
        ? "Open the event in a browser tab to sign in."
        : config.error;
    return (
      <WebAccountContext.Provider value={{ ...unavailable, error }}>
        {children}
      </WebAccountContext.Provider>
    );
  }
  return (
    <AuthKitProvider
      clientId={config.clientId}
      apiHostname={config.apiHostname}
      devMode={config.devMode}
      redirectUri={`${window.location.origin}/`}
      onRedirectCallback={() => window.history.replaceState({}, "", "/")}
    >
      <WebAccountBridge>{children}</WebAccountBridge>
    </AuthKitProvider>
  );
}
