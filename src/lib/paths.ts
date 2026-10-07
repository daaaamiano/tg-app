export function isLoginPath(pathname: string, base = import.meta.env.BASE_URL) {
  return pathname.replace(/\/$/, "") === `${base}login`;
}

export function appHomeUrl(origin: string, base = import.meta.env.BASE_URL) {
  return `${origin}${base}`;
}
