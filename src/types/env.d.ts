interface ImportMetaEnv {
  readonly BASE_URL: string;
  readonly VITE_DATA_SOURCE?: "mock" | "api";
  readonly VITE_PRIVATE_SERVICE?: "true" | "false";
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_TELEGRAM_BOT_USERNAME?: string;
  readonly VITE_WORKOS_CLIENT_ID?: string;
  readonly VITE_WORKOS_API_HOSTNAME?: string;
  readonly VITE_WORKOS_DEV_MODE?: "true" | "false";
}
