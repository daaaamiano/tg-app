import { describe, expect, it } from "vitest";
import { appHomeUrl, isLoginPath } from "./paths";

describe("hosting paths", () => {
  it.each(["/", "/tg-app/"])("keeps callbacks under %s", (base) => {
    expect(appHomeUrl("https://daaaamiano.github.io", base)).toBe(
      `https://daaaamiano.github.io${base}`
    );
  });

  it.each(["/", "/tg-app/"])("recognizes both static login URLs under %s", (base) => {
    expect(isLoginPath(`${base}login`, base)).toBe(true);
    expect(isLoginPath(`${base}login/`, base)).toBe(true);
    expect(isLoginPath(`${base}login/other`, base)).toBe(false);
  });

  it("does not treat another site's login as this app's login", () => {
    expect(isLoginPath("/login", "/tg-app/")).toBe(false);
    expect(isLoginPath("/other/login", "/tg-app/")).toBe(false);
  });
});
