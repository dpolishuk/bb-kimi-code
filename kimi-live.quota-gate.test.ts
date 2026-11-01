import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ProviderUsageResult } from "@get-bb/plugin-sdk/provider-bridge";
import { experimental_acpProviderBridge as acpProviderBridge } from "@get-bb/plugin-sdk/provider-bridge/acp-next";
import { experimental_createBridgeJsonRpcTestHarness as createBridgeJsonRpcTestHarness } from "@get-bb/plugin-sdk/provider-bridge/testing";
import { afterEach, beforeEach, expect, it } from "vitest";

import { mapPlanPromptMode } from "./src/prompt-mode.js";
import { gateQuotaExhaustedTurns } from "./src/quota-gate.js";

// Live integration: the composed bridge (same wrappers as host.ts, with the
// usage reader injected so the run does not depend on the signed-in
// account's real quota) spawns a real `kimi acp` child, starts a thread, and
// must fail turn/start with a typed rateLimited recovery hint instead of
// letting kimi swallow the 429 into a bare end_turn (the silent-turn bug this
// gate exists for). Needs the kimi binary on PATH; BB_KIMI_LIVE=1 to run.
const LIVE = process.env.BB_KIMI_LIVE === "1";
const itLive = LIVE ? it : it.skip;

let workspaceDir: string;

beforeEach(() => {
  workspaceDir = mkdtempSync(join(tmpdir(), "bb-kimi-quota-gate-"));
});

afterEach(() => {
  rmSync(workspaceDir, { recursive: true, force: true });
});

const OPTIONS = {
  permissionMode: "full",
  permissionScope: "full",
  approvalReviewer: null,
  permissionEscalation: null,
  providerOptions: {
    acpDialect: "kimi",
    acpLaunchSpec: {
      displayName: "Kimi Code",
      command: "kimi",
      args: ["acp"],
      env: {},
    },
  },
};

const exhaustedUsage: ProviderUsageResult = {
  supported: true,
  usage: {
    accountEmail: null,
    planLabel: null,
    status: "ok",
    windows: [
      { label: "5h limit", usedPercent: 11, resetsAt: "2999-01-01T00:00:00Z" },
      { label: "Weekly limit", usedPercent: 100, resetsAt: "2999-01-01T00:00:00Z" },
    ],
  },
};

itLive("gates turn/start with a rateLimited recovery hint while a window is spent", async () => {
  // The setup file disables the gate process-wide; this composition turns it
  // back on explicitly with the injected reader.
  const bridge = gateQuotaExhaustedTurns(mapPlanPromptMode(acpProviderBridge), {
    enabled: true,
    readUsage: async () => exhaustedUsage,
  });
  const harness = createBridgeJsonRpcTestHarness(bridge.handleLine);
  try {
    harness.sendRequest(1, "initialize", {
      client: { name: "kimi-live-test", version: "0.1.0" },
      protocolVersion: 2,
    });
    await harness.waitForResponse(1);

    harness.sendRequest(2, "thread/start", {
      threadId: "thr_live_quota_gate",
      cwd: workspaceDir,
      instructionMode: "replace",
      options: OPTIONS,
    });
    const startResponse = await harness.waitForResponse(2);
    expect(startResponse.error).toBeUndefined();
    const { providerThreadId } = startResponse.result as { providerThreadId: string };

    harness.sendRequest(3, "turn/start", {
      threadId: "thr_live_quota_gate",
      providerThreadId,
      clientRequestId: "creq_qg123abcde",
      input: [{ type: "text", text: "Say OK", mentions: [] }],
      options: OPTIONS,
    });

    const response = await harness.waitForResponse(3);
    expect(response.error).toBeDefined();
    const error = response.error as {
      code: number;
      message: string;
      data?: { recovery?: { kind: string; retryable: boolean } };
    };
    expect(error.code).toBe(-32000);
    expect(error.data?.recovery?.kind).toBe("rateLimited");
    expect(error.data?.recovery?.retryable).toBe(true);
    expect(error.message).toContain("Weekly limit");

    // The gate answered before the base bridge saw the line, so the turn
    // never opened: no thread/delta may mention the turn or any item.
    for (const message of harness.messages) {
      if (message.method !== "thread/delta") continue;
      const deltas = (message.params as { deltas?: Array<{ kind?: string }> }).deltas ?? [];
      for (const delta of deltas) {
        expect(delta.kind).not.toMatch(/^turn\./);
        expect(delta.kind).not.toMatch(/^item\./);
      }
    }

    harness.sendRequest(4, "thread/stop", {
      threadId: "thr_live_quota_gate",
      intent: "release",
    });
    await harness.waitForResponse(4);
  } finally {
    harness.restore();
  }
}, 120_000);
