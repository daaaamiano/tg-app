import type { OrganizationSession } from "../types/organization";

export const privateServiceMode = import.meta.env.VITE_PRIVATE_SERVICE === "true";
export const organizationAuthAvailable = import.meta.env.DEV || privateServiceMode;
export const telegramApiPrefix = privateServiceMode ? "/api/telegram/" : `${import.meta.env.BASE_URL}__local/telegram/`;

export async function organizationRequest<T>(route: string, options: RequestInit = {}): Promise<T> {
  if (!organizationAuthAvailable) throw new Error("Organization access requires the authenticated server.");
  const response = await fetch(`${telegramApiPrefix}${route}`, {
    ...options, credentials: "same-origin", cache: "no-store",
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "The request could not be completed.");
  return result as T;
}

export async function getOrganizationSession(): Promise<OrganizationSession | null> {
  if (!organizationAuthAvailable) return null;
  return (await organizationRequest<{ session: OrganizationSession | null }>("session")).session;
}
