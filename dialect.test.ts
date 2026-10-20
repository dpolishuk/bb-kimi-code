import { describe, expect, it } from "vitest";

import { kimiAcpDialect } from "./src/dialect.js";

describe("the kimi ACP dialect maintenance hooks", () => {
  it("installs kimi through the official install script", () => {
    const plan = kimiAcpDialect.maintenance?.installer();
    expect(plan?.displayCommand).toContain("code.kimi.com/kimi-code/install");
  });

  it("reads a valid OAuth credential as authenticated", async () => {
    const { readKimiAccount } = await import("./src/kimi-account.js");
    const now = Date.now();
    const credentials = JSON.stringify({
      access_token: "token",
      refresh_token: "refresh",
      expires_at: Math.floor(now / 1000) + 3600,
    });
    expect(readKimiAccount({ credentials, configToml: undefined, now })).toEqual({
      email: null,
    });
  });

  it("treats an expired token with a refresh token as authenticated", async () => {
    const { readKimiAccount } = await import("./src/kimi-account.js");
    const now = Date.now();
    const credentials = JSON.stringify({
      access_token: "token",
      refresh_token: "refresh",
      expires_at: Math.floor(now / 1000) - 3600,
    });
    expect(readKimiAccount({ credentials, configToml: undefined, now })).toEqual({
      email: null,
    });
  });

  it("treats an expired token without a refresh token as unauthenticated", async () => {
    const { readKimiAccount } = await import("./src/kimi-account.js");
    const now = Date.now();
    const credentials = JSON.stringify({
      access_token: "token",
      expires_at: Math.floor(now / 1000) - 3600,
    });
    expect(
      readKimiAccount({ credentials, configToml: undefined, now }),
    ).toBeNull();
  });

  it("treats a configured provider api_key as authenticated", async () => {
    const { readKimiAccount } = await import("./src/kimi-account.js");
    expect(
      readKimiAccount({
        credentials: undefined,
        configToml: '[providers.custom]\napi_key = "sk-test"\n',
        now: Date.now(),
      }),
    ).toEqual({ email: null });
  });

  it("treats missing or malformed credentials as unauthenticated", async () => {
    const { readKimiAccount } = await import("./src/kimi-account.js");
    expect(
      readKimiAccount({ credentials: undefined, configToml: undefined, now: Date.now() }),
    ).toBeNull();
    expect(
      readKimiAccount({ credentials: "not json", configToml: undefined, now: Date.now() }),
    ).toBeNull();
  });

  it("reports no account email: kimi OAuth tokens carry no email claim", async () => {
    // Verified 2026-10-20: credentials/kimi-code.json is a bare OAuth token
    // set; the access token JWT claims are client_id, device_id, exp, iat,
    // iss, jti, nbf, scope, sub, token_id, type, user_id — no email.
    await expect(kimiAcpDialect.maintenance?.readAccount()).resolves.toEqual({
      email: null,
    });
  });

  it("declares usage unsupported: kimi exposes no account quota interface", async () => {
    await expect(kimiAcpDialect.maintenance?.readUsage()).resolves.toEqual({
      supported: false,
    });
  });

  it("points terminal login at `kimi login`", () => {
    expect(kimiAcpDialect.maintenance?.loginCommand).toBe("kimi login");
  });
});
