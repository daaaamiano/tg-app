export const getTelegram = () => window.Telegram?.WebApp;
export const isInTelegram = () => Boolean(getTelegram()?.initData);

export function initializeTelegram() {
  const app = getTelegram();
  if (!app?.initData) return;
  app.ready();
  app.expand();
  if (app.isVersionAtLeast("6.1")) {
    app.setHeaderColor("#eeeae1");
    app.setBackgroundColor("#eeeae1");
  }
}

export function haptic() {
  const app = getTelegram();
  if (app?.initData && app.isVersionAtLeast("6.1"))
    app.HapticFeedback?.selectionChanged();
}

export function telegramLaunchUrl(username: string | undefined): string | null {
  if (!username) return null;
  const cleaned = username.replace(/^@/, "");
  return /^[a-zA-Z0-9_]{5,32}$/.test(cleaned)
    ? `https://t.me/${cleaned}?startapp`
    : null;
}
