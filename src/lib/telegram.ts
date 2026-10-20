export const getTelegram = () => window.Telegram?.WebApp;
export const isInTelegram = () => Boolean(getTelegram()?.initData);

export function initializeTelegram() {
  const app = getTelegram();
  if (!app?.initData) return;
  app.ready();
  app.expand();
  const syncTheme = () => {
    document.documentElement.dataset.telegramTheme = app.colorScheme === "dark" ? "dark" : "light";
    const colors = app.themeParams ?? {};
    for (const name of ["bg_color", "text_color", "hint_color", "link_color", "button_color", "button_text_color", "secondary_bg_color", "section_bg_color", "header_bg_color", "bottom_bar_bg_color", "destructive_text_color"]) {
      const property = `--tg-theme-${name.replaceAll("_", "-")}`;
      const value = colors[name];
      if (value && /^#[0-9a-f]{6}$/i.test(value)) document.documentElement.style.setProperty(property, value);
      else document.documentElement.style.removeProperty(property);
    }
    // Keep Telegram's surrounding chrome aligned with the legacy paper palette.
    const background = "#eeeae1";
    if (app.isVersionAtLeast("6.1")) {
      app.setHeaderColor(background);
      app.setBackgroundColor(background);
    }
    if (app.isVersionAtLeast("7.10")) app.setBottomBarColor?.(background);
  };
  syncTheme();
  app.onEvent?.("themeChanged", syncTheme);
  return () => app.offEvent?.("themeChanged", syncTheme);
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
