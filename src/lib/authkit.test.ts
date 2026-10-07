import { describe, expect, it } from "vitest";
import { getWebAuthConfig, toWebSession } from "./authkit";

describe("browser account configuration", () => {
  it("keeps the sandbox available without credentials", () => {
    expect(getWebAuthConfig({}, true).error).toContain("coming soon");
  });

  it("only needs a public client ID for local development", () => {
    const config = getWebAuthConfig(
      { VITE_WORKOS_CLIENT_ID: "client_01ABC123" },
      true
    );
    expect(config.error).toBe("");
    expect(config.devMode).toBe(true);
  });

  it("requires a custom authentication domain outside development mode", () => {
    expect(
      getWebAuthConfig({ VITE_WORKOS_CLIENT_ID: "client_01ABC123" }, false)
        .error
    ).not.toBe("");
    expect(
      getWebAuthConfig(
        {
          VITE_WORKOS_CLIENT_ID: "client_01ABC123",
          VITE_WORKOS_API_HOSTNAME: "auth.example.com",
        },
        false
      ).error
    ).toBe("");
  });

  it("allows an explicit hosted staging sandbox", () => {
    expect(
      getWebAuthConfig(
        {
          VITE_WORKOS_CLIENT_ID: "client_01ABC123",
          VITE_WORKOS_DEV_MODE: "true",
        },
        false
      ).error
    ).toBe("");
  });

  it("rejects a secret API key and malformed auth domain", () => {
    expect(
      getWebAuthConfig({ VITE_WORKOS_CLIENT_ID: "sk_test_example" }, true).error
    ).toContain("Client ID");
    expect(
      getWebAuthConfig(
        {
          VITE_WORKOS_CLIENT_ID: "client_01ABC123",
          VITE_WORKOS_API_HOSTNAME: "https://auth.example.com/path",
        },
        true
      ).error
    ).toContain("hostname");
  });

  it("maps WorkOS identities to the shared attendee profile without inventing a Telegram ID", () => {
    expect(
      toWebSession({
        id: "user_abc",
        email: "sam@example.com",
        firstName: null,
        lastName: null,
      })
    ).toEqual({
      mode: "authkit",
      user: {
        id: "user_abc",
        email: "sam@example.com",
        first_name: "sam",
        last_name: undefined,
      },
    });
  });
});
