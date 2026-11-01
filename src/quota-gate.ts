import type { ProviderUsageResult } from "@get-bb/plugin-sdk/provider-bridge";

import { readKimiUsage } from "./kimi-usage.js";

// kimi's acp-server answers a quota-exhausted (429) prompt with a bare
// `stopReason: "end_turn"` and zero session/update items — the failure never
// reaches the ACP wire, so the SDK bridge completes the turn cleanly and bb
// renders "The agent ended the turn without replying" (incident
// 2026-11-01-kimi-quota-silent-turns). Until upstream reports turn failures,
// the gate consults the same OAuth usage endpoint the maintenance dialect
// already reads and fails turn/start fast with a typed rateLimited recovery
// hint while a usage window is fully spent. Every other outcome — capacity
// left, unreachable endpoint, stale ratio, timeout — passes the line through
// unchanged, so the gate can never block a turn that would have run.

type BridgeLike = {
  handleLine: (line: string) => void;
};

interface QuotaGateOptions {
  enabled?: boolean;
  readUsage?: () => Promise<ProviderUsageResult>;
  timeoutMs?: number;
}

const BRIDGE_ERROR = -32000;

export function gateQuotaExhaustedTurns<B extends BridgeLike>(
  bridge: B,
  options: QuotaGateOptions = {},
): B {
  if (options.enabled === false) {
    return bridge;
  }
  const readUsage = options.readUsage ?? readKimiUsage;
  const timeoutMs = options.timeoutMs ?? 2_500;
  return {
    ...bridge,
    handleLine(line: string) {
      const requestId = turnStartRequestId(line);
      if (requestId === undefined) {
        bridge.handleLine(line);
        return;
      }
      void decideGate(readUsage, timeoutMs).then((exhausted) => {
        if (exhausted === undefined) {
          bridge.handleLine(line);
          return;
        }
        writeJson({
          jsonrpc: "2.0",
          id: requestId,
          error: {
            code: BRIDGE_ERROR,
            message: `Kimi Code usage limit reached: ${exhausted.label} is exhausted, resets at ${exhausted.resetsAt}. The turn was not sent to Kimi.`,
            data: {
              recovery: {
                kind: "rateLimited",
                message: `${exhausted.label} usage is exhausted until ${exhausted.resetsAt}.`,
                retryable: true,
              },
            },
          },
        });
      });
    },
  } as B;
}

type TurnStartLine = {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
};

function turnStartRequestId(line: string): unknown | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return undefined;
  }
  const request = parsed as TurnStartLine;
  if (request.jsonrpc !== "2.0" || request.method !== "turn/start") {
    return undefined;
  }
  return typeof request.id === "number" || typeof request.id === "string"
    ? request.id
    : undefined;
}

async function decideGate(
  readUsage: () => Promise<ProviderUsageResult>,
  timeoutMs: number,
): Promise<{ label: string; resetsAt: string } | undefined> {
  let result: ProviderUsageResult;
  try {
    result = await withTimeout(readUsage(), timeoutMs);
  } catch {
    return undefined;
  }
  // ProviderUsageResult is a loose zod schema; narrow structurally instead of
  // relying on TypeScript's discriminated-union narrowing.
  const usage = (result as { usage?: unknown }).usage;
  if (typeof usage !== "object" || usage === null) {
    return undefined;
  }
  const status = (usage as { status?: unknown }).status;
  const windows = (usage as { windows?: unknown }).windows;
  if (status !== "ok" || !Array.isArray(windows)) {
    return undefined;
  }
  const now = Date.now();
  let binding: { label: string; resetsAtMs: number; resetsAt: string } | undefined;
  for (const entry of windows) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    const window = entry as { label?: unknown; resetsAt?: unknown; usedPercent?: unknown };
    if (typeof window.label !== "string" || typeof window.usedPercent !== "number" || window.usedPercent < 100) {
      continue;
    }
    // A spent window whose reset time already passed (or is missing) is
    // stale data, not a live block — the quota has most likely reopened
    // since, so the gate must not act without a future reset timestamp.
    if (typeof window.resetsAt !== "string") {
      continue;
    }
    const resetsAtMs = Date.parse(window.resetsAt);
    if (Number.isNaN(resetsAtMs) || resetsAtMs <= now) {
      continue;
    }
    const resetsAt = window.resetsAt;
    if (binding === undefined || resetsAtMs < binding.resetsAtMs) {
      binding = { label: window.label, resetsAtMs, resetsAt };
    }
  }
  return binding === undefined
    ? undefined
    : { label: binding.label, resetsAt: binding.resetsAt };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("usage check timed out")), timeoutMs);
    timer.unref?.();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function writeJson(message: unknown): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}
