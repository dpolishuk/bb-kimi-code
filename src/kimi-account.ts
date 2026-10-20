import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface KimiAccountInput {
  credentials: string | undefined;
  configToml: string | undefined;
  now: number;
}

// `~/.kimi-code/credentials/kimi-code.json` is a bare OAuth token set:
// { access_token, refresh_token?, expires_at (epoch seconds), scope,
// token_type, expires_in }. Verified 2026-10-20 against CLI 2.2.0. The access
// token JWT carries no email claim, so the account email is always null.
export function readKimiAccount(
  input: KimiAccountInput,
): { email: string | null } | null {
  if (hasValidCredential(input.credentials, input.now)) {
    return { email: null };
  }
  if (hasConfiguredApiKey(input.configToml)) {
    return { email: null };
  }
  return null;
}

function hasValidCredential(
  credentials: string | undefined,
  now: number,
): boolean {
  if (credentials === undefined) {
    return false;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(credentials);
  } catch {
    return false;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return false;
  }
  const record = parsed as Record<string, unknown>;
  if (
    typeof record.access_token !== "string" ||
    record.access_token.length === 0
  ) {
    return false;
  }
  const expiresAt = record.expires_at;
  if (typeof expiresAt === "number" && expiresAt * 1000 > now) {
    return true;
  }
  // kimi refreshes the access token on launch when a refresh token exists.
  return (
    typeof record.refresh_token === "string" && record.refresh_token.length > 0
  );
}

function hasConfiguredApiKey(configToml: string | undefined): boolean {
  if (configToml === undefined) {
    return false;
  }
  return /^\s*api_key\s*=\s*"[^"]+"/m.test(configToml);
}

export async function readKimiAccountFromDisk(): Promise<{
  email: string | null;
} | null> {
  const home = homedir();
  const [credentials, configToml] = await Promise.all([
    readFile(join(home, ".kimi-code", "credentials", "kimi-code.json"), "utf8").catch(
      () => undefined,
    ),
    readFile(join(home, ".kimi-code", "config.toml"), "utf8").catch(
      () => undefined,
    ),
  ]);
  return readKimiAccount({ credentials, configToml, now: Date.now() });
}
