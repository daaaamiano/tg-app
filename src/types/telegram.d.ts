import type { Attendee } from "./event";

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { user?: Attendee & { allows_write_to_pm?: boolean } };
  platform: string;
  colorScheme?: "light" | "dark";
  themeParams?: Record<string, string | undefined>;
  onEvent?(event: "themeChanged", callback: () => void): void;
  offEvent?(event: "themeChanged", callback: () => void): void;
  setBottomBarColor?(color: string): void;
  ready(): void;
  expand(): void;
  isVersionAtLeast(version: string): boolean;
  requestWriteAccess?(callback: (allowed: boolean) => void): void;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  HapticFeedback?: {
    selectionChanged(): void;
    notificationOccurred(type: "success" | "error" | "warning"): void;
  };
}
declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
      Login?: {
        auth(options: { client_id: number; scope: string[]; nonce: string }, callback: (result: { id_token?: string; error?: string }) => void): void;
      };
    };
  }
}
