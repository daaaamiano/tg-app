import type { Attendee } from "./event";

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { user?: Attendee };
  platform: string;
  ready(): void;
  expand(): void;
  isVersionAtLeast(version: string): boolean;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  HapticFeedback?: {
    selectionChanged(): void;
    notificationOccurred(type: "success" | "error" | "warning"): void;
  };
}
declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}
