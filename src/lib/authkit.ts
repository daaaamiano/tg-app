import type { AuthSession } from "../types/event";

export interface WebAuthConfig {
  clientId: string;
  apiHostname?: string;
  devMode: boolean;
  error: string;
}

export function getWebAuthConfig(
  env: {
    VITE_WORKOS_CLIENT_ID?: string;
    VITE_WORKOS_API_HOSTNAME?: string;
    VITE_WORKOS_DEV_MODE?: string;
  },
  isLocalDevelopment: boolean
): WebAuthConfig {
  const clientId = env.VITE_WORKOS_CLIENT_ID?.trim() ?? "";
  const apiHostname = env.VITE_WORKOS_API_HOSTNAME?.trim() || undefined;
  const devMode = isLocalDevelopment || env.VITE_WORKOS_DEV_MODE === "true";
  let error = "";
  if (!clientId)
    error = "Web sign-in is coming soon. You can explore the demo below.";
  else if (!/^client_[a-z0-9]+$/i.test(clientId))
    error =
      "The web sign-in configuration is incomplete. Please check the WorkOS Client ID.";
  else if (
    apiHostname &&
    !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(apiHostname)
  )
    error =
      "The authentication domain must be a hostname such as auth.example.com, without https:// or a path.";
  else if (!devMode && !apiHostname)
    error = "Web sign-in is not configured for this domain yet.";
  return { clientId, apiHostname, devMode, error };
}

export function toWebSession(user: {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}): AuthSession {
  return {
    mode: "authkit",
    user: {
      id: user.id,
      first_name: user.firstName?.trim() || user.email.split("@")[0] || "Guest",
      last_name: user.lastName || undefined,
      email: user.email,
    },
  };
}
