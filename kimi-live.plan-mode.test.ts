import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { experimental_createBridgeJsonRpcTestHarness as createBridgeJsonRpcTestHarness } from "@get-bb/plugin-sdk/provider-bridge/testing";
import { afterEach, beforeEach, expect, it } from "vitest";

const LIVE = process.env.BB_KIMI_LIVE === "1";
const itLive = LIVE ? it : it.skip;

let workspaceDir: string;

beforeEach(() => {
  workspaceDir = mkdtempSync(join(tmpdir(), "bb-kimi-plan-mode-"));
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

itLive("promptMode plan actually enters kimi plan mode", async () => {
  const { experimental_providerBridge: bridge } = await import("./host.js");
  const harness = createBridgeJsonRpcTestHarness(bridge.handleLine);
  try {
    harness.sendRequest(1, "initialize", {
      client: { name: "kimi-live-test", version: "0.1.0" },
      protocolVersion: 2,
    });
    await harness.waitForResponse(1);

    harness.sendRequest(2, "thread/start", {
      threadId: "thr_live_plan_mode",
      cwd: workspaceDir,
      instructionMode: "replace",
      options: OPTIONS,
    });
    const startResponse = await harness.waitForResponse(2);
    expect(startResponse.error).toBeUndefined();
    const { providerThreadId } = startResponse.result as { providerThreadId: string };

    harness.sendRequest(3, "turn/start", {
      threadId: "thr_live_plan_mode",
      providerThreadId,
      clientRequestId: "creq_pq789abcde",
      input: [{ type: "text", text: "Say OK", mentions: [] }],
      options: { ...OPTIONS, promptMode: "plan" },
    });

    const deadline = Date.now() + 60_000;
    let currentMode: unknown;
    while (Date.now() < deadline && currentMode !== "plan") {
      await harness.flushWork();
      await new Promise((resolve) => setTimeout(resolve, 250));
      for (const message of harness.messages) {
        if (message.method !== "thread/delta") continue;
        const deltas = (message.params as {
          deltas?: Array<{
            kind?: string;
            extensionKind?: string;
            payload?: { options?: Array<{ id?: string; value?: unknown }> };
          }>;
        }).deltas;
        for (const delta of deltas ?? []) {
          if (delta.kind !== "extension.state" || delta.extensionKind !== "bb/session-options") continue;
          currentMode = delta.payload?.options?.find((option) => option.id === "mode")?.value;
        }
      }
    }
    harness.sendRequest(4, "thread/stop", {
      threadId: "thr_live_plan_mode",
      intent: "release",
    });
    await harness.waitForResponse(4);
    expect(currentMode).toBe("plan");
  } finally {
    harness.restore();
  }
}, 120_000);
