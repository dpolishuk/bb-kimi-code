import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import type { ProviderUsageResult } from "@get-bb/plugin-sdk/provider-bridge";

const USAGE_URL = "https://api.kimi.com/coding/v1/usages";

interface UsageOptions {
  fetchImpl?: typeof fetch;
  credentials?: string;
}

type UsagePayload = Extract<ProviderUsageResult, { supported: true }>["usage"];
type UsageWindow = Extract<UsagePayload, { status: "ok" }>["windows"][number];

export async function readKimiUsage(options: UsageOptions = {}): Promise<ProviderUsageResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const credentials = options.credentials ?? (await readCredentialsFile());
  const token = readAccessToken(credentials);
  if (token === undefined) {
    return { supported: true, usage: { status: "unauthenticated" } };
  }

  let response: Response;
  try {
    response = await fetchImpl(USAGE_URL, {
      headers: { authorization: `Bearer ${token}` },
    });
  } catch (error) {
    return {
      supported: true,
      usage: {
        accountEmail: null,
        planLabel: null,
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
  if (response.status === 401 || response.status === 403) {
    return { supported: true, usage: { status: "expired" } };
  }
  if (!response.ok) {
    return {
      supported: true,
      usage: {
        accountEmail: null,
        planLabel: null,
        status: "error",
        message: `usage endpoint returned HTTP ${response.status}`,
      },
    };
  }

  const payload = (await response.json()) as unknown;
  return { supported: true, usage: mapQuota(payload) };
}

async function readCredentialsFile(): Promise<string | undefined> {
  try {
    return await readFile(
      join(homedir(), ".kimi-code", "credentials", "kimi-code.json"),
      "utf8",
    );
  } catch {
    return undefined;
  }
}

function readAccessToken(credentials: string | undefined): string | undefined {
  if (credentials === undefined) return undefined;
  try {
    const parsed = JSON.parse(credentials) as { access_token?: unknown };
    return typeof parsed.access_token === "string" && parsed.access_token.length > 0
      ? parsed.access_token
      : undefined;
  } catch {
    return undefined;
  }
}

function mapQuota(payload: unknown): UsagePayload {
  const root = payload as {
    usages?: Record<string, { used_ratio?: unknown; reset_time?: unknown }>;
    boosterWallet?: unknown;
  };
  const windows: UsageWindow[] = [];
  const labels = [
    ["limit_5h", "5h limit"],
    ["limit_7d", "Weekly limit"],
    ["limit_month_total", "Monthly limit"],
    ["limit_month_code", "Monthly code limit"],
  ] as const;
  for (const [key, label] of labels) {
    const entry = root.usages?.[key];
    if (entry !== undefined && typeof entry.used_ratio === "number") {
      windows.push({
        label,
        resetsAt: typeof entry.reset_time === "string" ? entry.reset_time : null,
        usedPercent: entry.used_ratio * 100,
      });
    }
  }
  const cost = readBoosterCost(root.boosterWallet);
  if (cost !== undefined) {
    windows.push({
      label: "Booster wallet",
      resetsAt: null,
      usedPercent: cost.totalCents > 0 ? (cost.usedCents / cost.totalCents) * 100 : 0,
      cost: { limitUsdCents: cost.limitCents, usedUsdCents: cost.usedCents },
    });
  }
  return { accountEmail: null, planLabel: null, status: "ok", windows };
}

function readBoosterCost(
  raw: unknown,
): { limitCents: number; usedCents: number; totalCents: number } | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const wallet = raw as {
    balance?: { amount?: unknown };
    monthlyChargeLimit?: { priceInCents?: unknown };
    monthlyUsed?: { priceInCents?: unknown };
  };
  const limit = wallet.monthlyChargeLimit?.priceInCents;
  const used = wallet.monthlyUsed?.priceInCents;
  const total = wallet.balance?.amount;
  if (
    typeof limit !== "number" ||
    typeof used !== "number" ||
    typeof total !== "number"
  ) {
    return undefined;
  }
  return { limitCents: limit, usedCents: used, totalCents: total };
}
