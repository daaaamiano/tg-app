import type { Attendee, EventData } from "../types/event";
import { organizationRequest } from "./organization";

const baseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";
export const apiConfigured = Boolean(baseUrl);
export const usingMockData = import.meta.env.VITE_DATA_SOURCE !== "api";
// Explicit developer opt-in only. Production builds can never enable demo accounts.
export const demoAccountEnabled = import.meta.env.DEV
  && import.meta.env.VITE_PRIVATE_SERVICE !== "true"
  && usingMockData
  && import.meta.env.VITE_ENABLE_DEMO === "true";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!baseUrl)
    throw new Error("Set VITE_API_BASE_URL to connect your event API.");
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  if (!response.ok)
    throw new Error(
      `The request failed (${response.status}). Please try again.`
    );
  return response.json() as Promise<T>;
}

export async function getEvent(telegramSession = false, signal?: AbortSignal): Promise<EventData> {
  // This compile-time branch removes preview event data from private frontend builds.
  if (import.meta.env.VITE_PRIVATE_SERVICE === "true" || telegramSession)
    return organizationRequest<EventData>("events", { signal });
  if (usingMockData) return (await import("../data/event")).demoEvent;
  return request<EventData>("/event");
}

// The backend must validate the signature and age of initData, then set an HttpOnly session cookie.
// Never send a bot token to the browser or treat initDataUnsafe as verified identity.
export function authenticateTelegram(
  initData: string
): Promise<{ user: Attendee }> {
  return request("/auth/telegram", {
    method: "POST",
    body: JSON.stringify({ initData }),
  });
}

export async function logoutTelegram(): Promise<void> {
  if (!baseUrl) return;
  const response = await fetch(`${baseUrl}/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) throw new Error("Could not sign out. Please try again.");
}
