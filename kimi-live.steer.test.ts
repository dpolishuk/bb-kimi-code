import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { experimental_createBridgeJsonRpcTestHarness as createBridgeJsonRpcTestHarness } from "@get-bb/plugin-sdk/provider-bridge/testing";
import { afterEach, beforeEach, expect, it } from "vitest";

// Live integration test: steer and interrupt paths against a real `kimi acp`
// turn. The bridge queues steer input and cancels the active ACP prompt
// (session/cancel), then runs the queued input as the next turn; kimi must
// honor the cancel for this to settle. Spends model tokens, so it runs only
// when BB_KIMI_LIVE=1 is set explicitly.
const LIVE = process.env.BB_KIMI_LIVE === "1";
const itLive = LIVE ? it : it.skip;

let workspaceDir: string;

beforeEach(() => {
  workspaceDir = mkdtempSync(join(tmpdir(), "bb-kimi-steer-"));
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

const SLOW_PROMPT =
  "Write a 400-line poem about recursion, one numbered line at a time. Do not use any tools.";

function collectDeltas(messages: unknown[]): {
  text: string;
  boundaries: number;
} {
  let text = "";
  let boundaries = 0;
  for (const message of messages) {
    if (typeof message !== "object" || message === null) continue;
    const { method, params } = message as {
      method?: string;
      params?: { deltas?: Array<Record<string, unknown>> };
    };
    if (method !== "thread/delta" || !Array.isArray(params?.deltas)) continue;
    for (const delta of params.deltas) {
      if (delta.kind === "item.textDelta" && typeof delta.text === "string") {
        text += delta.text;
      }
      if (delta.kind === "turn.boundary") {
        boundaries += 1;
      }
    }
  }
  return { text, boundaries };
}

async function startThreadWithSlowTurn(
  bridge: { handleLine: (line: string) => void },
  harness: ReturnType<typeof createBridgeJsonRpcTestHarness>,
): Promise<string> {
  harness.sendRequest(1, "initialize", {
    client: { name: "kimi-live-test", version: "0.1.0" },
    protocolVersion: 2,
  });
  await harness.waitForResponse(1);

  harness.sendRequest(2, "thread/start", {
    threadId: "thr_live_steer",
    cwd: workspaceDir,
    instructionMode: "replace",
    options: OPTIONS,
  });
  const startResponse = await harness.waitForResponse(2);
  const { providerThreadId } = startResponse.result as { providerThreadId: string };

  harness.sendRequest(3, "turn/start", {
    threadId: "thr_live_steer",
    providerThreadId,
    clientRequestId: "creq_cccccccccc",
    input: [{ type: "text", text: SLOW_PROMPT, mentions: [] }],
    options: OPTIONS,
  });
  return providerThreadId;
}

itLive("steers an active turn: kimi honors cancel and answers the steered input", async () => {
  const { experimental_providerBridge: bridge } = await import("./host.js");
  const harness = createBridgeJsonRpcTestHarness(bridge.handleLine);
  try {
    const providerThreadId = await startThreadWithSlowTurn(bridge, harness);

    const startDeadline = Date.now() + 60_000;
    let deltas = collectDeltas(harness.messages);
    while (Date.now() < startDeadline && deltas.text.length === 0) {
      await harness.flushWork();
      await new Promise((resolve) => setTimeout(resolve, 200));
      deltas = collectDeltas(harness.messages);
    }
    expect(deltas.text.length).toBeGreaterThan(0);

    // The ACP steer handler queues the input and cancels the active prompt; it
    // does not read expectedTurnId (schema-required field). kimi reports no
    // provider turn id, so there is nothing meaningful to pin here.
    harness.sendRequest(4, "turn/steer", {
      threadId: "thr_live_steer",
      providerThreadId,
      clientRequestId: "creq_dddddddddd",
      expectedTurnId: "turn-under-test",
      input: [
        {
          type: "text",
          text: "Stop the poem. Reply with exactly: steered-ok",
          mentions: [],
        },
      ],
      options: OPTIONS,
    });
    const steerResponse = await harness.waitForResponse(4);
    expect(steerResponse.error).toBeUndefined();

    const deadline = Date.now() + 180_000;
    let final = collectDeltas(harness.messages);
    while (Date.now() < deadline && !final.text.includes("steered-ok")) {
      await harness.flushWork();
      await new Promise((resolve) => setTimeout(resolve, 500));
      final = collectDeltas(harness.messages);
    }
    expect(final.text).toContain("steered-ok");
  } finally {
    harness.restore();
  }
}, 300_000);

itLive("interrupts an active turn via thread/stop and settles it", async () => {
  const { experimental_providerBridge: bridge } = await import("./host.js");
  const harness = createBridgeJsonRpcTestHarness(bridge.handleLine);
  try {
    const providerThreadId = await startThreadWithSlowTurn(bridge, harness);

    const startDeadline = Date.now() + 60_000;
    let deltas = collectDeltas(harness.messages);
    while (Date.now() < startDeadline && deltas.text.length === 0) {
      await harness.flushWork();
      await new Promise((resolve) => setTimeout(resolve, 200));
      deltas = collectDeltas(harness.messages);
    }
    expect(deltas.text.length).toBeGreaterThan(0);

    harness.sendRequest(4, "thread/stop", {
      threadId: "thr_live_steer",
      providerThreadId,
      intent: "interrupt",
      activeTurnId: null,
    });
    const stopResponse = await harness.waitForResponse(4);
    expect(stopResponse.error).toBeUndefined();

    const deadline = Date.now() + 60_000;
    let final = collectDeltas(harness.messages);
    while (Date.now() < deadline && final.boundaries === 0) {
      await harness.flushWork();
      await new Promise((resolve) => setTimeout(resolve, 300));
      final = collectDeltas(harness.messages);
    }
    expect(final.boundaries).toBeGreaterThan(0);
  } finally {
    harness.restore();
  }
}, 300_000);
