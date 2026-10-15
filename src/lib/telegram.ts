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
    const fallback = app.colorScheme === "dark" ? "#17212b" : "#eff1f5";
    const background = colors.secondary_bg_color && /^#[0-9a-f]{6}$/i.test(colors.secondary_bg_color) ? colors.secondary_bg_color : fallback;
    if (app.isVersionAtLeast("6.1")) {
      app.setHeaderColor("bg_color");
      app.setBackgroundColor(background);
    }
    if (app.isVersionAtLeast("7.10")) app.setBottomBarColor?.(colors.bottom_bar_bg_color && /^#[0-9a-f]{6}$/i.test(colors.bottom_bar_bg_color) ? colors.bottom_bar_bg_color : background);
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
