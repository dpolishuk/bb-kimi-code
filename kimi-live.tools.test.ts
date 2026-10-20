import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { experimental_createBridgeJsonRpcTestHarness as createBridgeJsonRpcTestHarness } from "@get-bb/plugin-sdk/provider-bridge/testing";
import { afterEach, beforeEach, expect, it } from "vitest";

// Live integration test: a real turn that forces kimi to use a file-writing
// tool, proving the tool-call pipeline (item.open/close with fileChange or
// command shapes) end to end. Spends a small amount of model tokens, so it
// runs only when BB_KIMI_LIVE=1 is set explicitly.
const LIVE = process.env.BB_KIMI_LIVE === "1";

let workspaceDir: string;

beforeEach(() => {
  workspaceDir = mkdtempSync(join(tmpdir(), "bb-kimi-tools-"));
});

afterEach(() => {
  rmSync(workspaceDir, { recursive: true, force: true });
});

const itLive = LIVE ? it : it.skip;

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

itLive("runs a real turn with a tool call and settles it", async () => {
  const { experimental_providerBridge: bridge } = await import("./host.js");
  const harness = createBridgeJsonRpcTestHarness(bridge.handleLine);
  try {
    harness.sendRequest(1, "initialize", {
      client: { name: "kimi-live-test", version: "0.1.0" },
      protocolVersion: 2,
    });
    await harness.waitForResponse(1);

    harness.sendRequest(2, "thread/start", {
      threadId: "thr_live_tools",
      cwd: workspaceDir,
      instructionMode: "replace",
      options: OPTIONS,
    });
    const startResponse = await harness.waitForResponse(2);
    expect(startResponse.error).toBeUndefined();
    const { providerThreadId } = startResponse.result as { providerThreadId: string };

    harness.sendRequest(3, "turn/start", {
      threadId: "thr_live_tools",
      providerThreadId,
      clientRequestId: "creq_aaaaaaaaaa",
      input: [
        {
          type: "text",
          text: "Create the file probe-tool.txt with the exact content `kimi-ok` using your file writing tool, then reply with exactly: done",
          mentions: [],
        },
      ],
      options: OPTIONS,
    });

    const deadline = Date.now() + 180_000;
    const answeredRequests = new Set<unknown>();
    let settled = false;
    let sawToolItem = false;
    while (Date.now() < deadline && !settled) {
      await harness.flushWork();
      await new Promise((resolve) => setTimeout(resolve, 500));
      for (const message of harness.messages) {
        // Stand in for the bb runtime: approve every permission request the
        // way the "full" permission mode would.
        if (message.method === "interaction/request" && message.id !== undefined) {
          if (!answeredRequests.has(message.id)) {
            answeredRequests.add(message.id);
            bridge.handleLine(
              JSON.stringify({
                jsonrpc: "2.0",
                id: message.id,
                result: { decision: "allow_once", grantedPermissions: null },
              }),
            );
          }
          continue;
        }
        if (message.method !== "thread/delta") continue;
        const deltas = (message.params as { deltas?: Array<Record<string, unknown>> })
          .deltas ?? [];
        for (const delta of deltas) {
          if (
            (delta.kind === "item.open" || delta.kind === "item.close") &&
            typeof delta.item === "object" &&
            delta.item !== null &&
            ["fileChange", "command", "tool"].includes(
              (delta.item as { type?: string }).type ?? "",
            )
          ) {
            sawToolItem = true;
          }
          if (delta.kind === "turn.boundary") {
            settled = true;
          }
        }
      }
    }

    expect(sawToolItem).toBe(true);
    expect(settled).toBe(true);
  } finally {
    harness.restore();
  }
}, 240_000);
