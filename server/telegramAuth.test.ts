import { createHmac } from "node:crypto";
import { generateKeyPair, SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { isSystemAdmin, SESSION_SECONDS, TelegramSessions, verifyBrowserToken, verifyMiniAppData } from "./telegramAuth";

const token = "123456789:test-secret-only";
const now = Date.now();
function signLaunch(fields: Record<string, string>, botToken = token) {
  const check = Object.entries(fields).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join("\n");
  const key = createHmac("sha256", "WebAppData").update(botToken).digest();
  return new URLSearchParams({ ...fields, hash: createHmac("sha256", key).update(check).digest("hex") }).toString();
}
const launch = (id: number, date = Math.floor(now / 1000)) => signLaunch({ auth_date: String(date), user: JSON.stringify({ id, first_name: "Test user" }) });

describe("Telegram admin identity", () => {
  it("grants admin only to the single verified ID, regardless of name or group role", () => {
    expect(isSystemAdmin(verifyMiniAppData(launch(17666600), token, now))).toBe(true);
    expect(isSystemAdmin(verifyMiniAppData(launch(8446889371), token, now))).toBe(false);
    expect(isSystemAdmin({ id: 123, first_name: "Admin", username: "bloody_bit" })).toBe(false);
  });

  it("rejects edited IDs, wrong bots, missing hashes and duplicate fields", () => {
    const data = new URLSearchParams(launch(8446889371));
    data.set("user", JSON.stringify({ id: 17666600, first_name: "Forged" }));
    for (const value of [data.toString(), launch(17666600) + "&user={}", "user={}", launch(17666600).replace(/hash=[^&]+/, "hash=bad")])
      expect(() => verifyMiniAppData(value, token, now)).toThrow();
    expect(() => verifyMiniAppData(launch(17666600), "another-bot", now)).toThrow();
  });

  it("rejects stale, future and invalid timestamps and malformed or bot identities", () => {
    for (const date of [Math.floor(now / 1000) - 301, Math.floor(now / 1000) + 31])
      expect(() => verifyMiniAppData(launch(17666600, date), token, now)).toThrow();
    for (const user of [{ id: "17666600", first_name: "Invalid" }, { id: 17666600, first_name: "Bot", is_bot: true }, { id: 17666600 }, { id: -1, first_name: "Invalid" }])
      expect(() => verifyMiniAppData(signLaunch({ auth_date: String(Math.floor(now / 1000)), user: JSON.stringify(user) }), token, now)).toThrow();
  });

  it("expires sessions, ignores forged cookies, and revokes old sessions on logout", () => {
    const sessions = new TelegramSessions();
    const created = sessions.create({ id: 17666600, first_name: "Admin" }, now);
    expect(created.token.length).toBeGreaterThan(40);
    expect(sessions.get(created.token, now)?.isSystemAdmin).toBe(true);
    expect(sessions.get("17666600", now)).toBeNull();
    expect(sessions.get(created.token, now + SESSION_SECONDS * 1000)).toBeNull();
    const next = sessions.create({ id: 17666600, first_name: "Admin" }, now);
    sessions.revoke(next.token);
    expect(sessions.get(next.token, now)).toBeNull();
  });

  it("verifies browser JWT signature, audience, issuer, nonce, expiry and the Telegram profile ID", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const keys = async () => publicKey;
    async function sign(claims: Record<string, unknown> = {}) {
      return new SignJWT({ id: 17666600, sub: "different-oidc-subject", given_name: "Admin", nonce: "challenge", ...claims })
        .setProtectedHeader({ alg: "RS256" }).setIssuer("https://oauth.telegram.org").setAudience("123456789")
        .setIssuedAt().setExpirationTime("5m").sign(privateKey);
    }
    expect((await verifyBrowserToken(await sign(), "123456789", "challenge", keys)).id).toBe(17666600);
    await expect(verifyBrowserToken(await sign(), "wrong-client", "challenge", keys)).rejects.toThrow();
    await expect(verifyBrowserToken(await sign(), "123456789", "wrong-nonce", keys)).rejects.toThrow();
    await expect(verifyBrowserToken(await sign({ id: undefined }), "123456789", "challenge", keys)).rejects.toThrow();
    const badIssuer = await new SignJWT({ id: 17666600, given_name: "Admin", nonce: "challenge" }).setProtectedHeader({ alg: "RS256" }).setIssuer("attacker").setAudience("123456789").setIssuedAt().setExpirationTime("5m").sign(privateKey);
    await expect(verifyBrowserToken(badIssuer, "123456789", "challenge", keys)).rejects.toThrow();
    const expired = await new SignJWT({ id: 17666600, given_name: "Admin", nonce: "challenge" }).setProtectedHeader({ alg: "RS256" }).setIssuer("https://oauth.telegram.org").setAudience("123456789").setIssuedAt(Math.floor(now / 1000) - 600).setExpirationTime(Math.floor(now / 1000) - 300).sign(privateKey);
    await expect(verifyBrowserToken(expired, "123456789", "challenge", keys)).rejects.toThrow();
    const otherKeys = await generateKeyPair("RS256");
    await expect(verifyBrowserToken(await sign(), "123456789", "challenge", async () => otherKeys.publicKey)).rejects.toThrow();
  });
});
