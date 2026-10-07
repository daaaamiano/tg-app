import { demoEvent } from "../data/event";
import type { Attendee, EventData } from "../types/event";

const baseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "";
export const apiConfigured = Boolean(baseUrl);
export const usingMockData = import.meta.env.VITE_DATA_SOURCE !== "api";

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

export async function getEvent(): Promise<EventData> {
  if (usingMockData) return demoEvent;
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
