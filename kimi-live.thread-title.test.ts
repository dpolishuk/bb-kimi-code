import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { experimental_createBridgeJsonRpcTestHarness as createBridgeJsonRpcTestHarness } from "@get-bb/plugin-sdk/provider-bridge/testing";
import { afterEach, beforeEach, expect, it } from "vitest";

const LIVE = process.env.BB_KIMI_LIVE === "1";
const itLive = LIVE ? it : it.skip;

// Sends one short prompt through the real `kimi acp`; no BB thread is created.
const OPTIONS = {
  permissionMode: "full",
  permissionScope: "full",
  approvalReviewer: null,
  permissionEscalation: null,
  instructions:
    "If the user asks you to move this thread, call update_environment_directory.",
  providerOptions: {
    acpLaunchSpec: {
      displayName: "Kimi Code",
      command: "kimi",
      args: ["acp"],
      env: {},
    },
  },
};

let workspaceDir: string;

beforeEach(() => {
  workspaceDir = mkdtempSync(join(tmpdir(), "bb-kimi-title-"));
});

afterEach(() => {
  rmSync(workspaceDir, { recursive: true, force: true });
});

function agentTitles(messages: unknown[]): string[] {
  const titles: string[] = [];
  for (const message of messages) {
    if (typeof message !== "object" || message === null) continue;
    const { method, params } = message as {
      method?: string;
      params?: { deltas?: Array<{ kind?: string; name?: unknown; source?: unknown }> };
    };
    if (method !== "thread/delta" || !Array.isArray(params?.deltas)) continue;
    for (const delta of params.deltas) {
      if (
        delta.kind === "thread.name" &&
        delta.source === "agent" &&
        typeof delta.name === "string"
      ) {
        titles.push(delta.name);
      }
    }
  }
  return titles;
}

itLive("does not publish Kimi's harness-derived fallback title", async () => {
  const { experimental_providerBridge: bridge } =
    process.env.BB_KIMI_HOST_ENTRY === "./dist/host.js"
      // @ts-expect-error The built bundle does not ship type declarations.
      ? await import("./dist/host.js")
      : await import("./host.js");
  const originalWrite = process.stdout.write;
  const harness = createBridgeJsonRpcTestHarness(bridge.handleLine);
  try {
    bridge.start?.({
      pluginId: "kimi-code",
      dataDir: join(workspaceDir, "data"),
      tempDir: join(workspaceDir, "temp"),
    });
    harness.sendRequest(1, "initialize", {
      client: { name: "kimi-live-title-test", version: "0.1.0" },
      protocolVersion: 2,
    });
    expect((await harness.waitForResponse(1)).error).toBeUndefined();

    harness.sendRequest(2, "thread/start", {
      threadId: "thr_live_title",
      cwd: workspaceDir,
      instructionMode: "replace",
      options: OPTIONS,
    });
    const startResponse = await harness.waitForResponse(2);
    expect(startResponse.error).toBeUndefined();
    const providerThreadId = (startResponse.result as { providerThreadId: string })
      .providerThreadId;
    harness.sendRequest(3, "turn/start", {
      threadId: "thr_live_title",
      providerThreadId,
      clientRequestId: "creq_aaaaaaaaaa",
      input: [{ type: "text", text: "hi", mentions: [] }],
      options: OPTIONS,
    });

    let turnBoundarySeen = false;
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      await harness.flushWork();
      if (
        harness.messages.some((message) => {
          if (typeof message !== "object" || message === null) return false;
          const params = (message as { params?: { deltas?: Array<{ kind?: string }> } }).params;
          return params?.deltas?.some(
            (delta) => delta.kind === "turn.boundary" && "status" in delta,
          );
        })
      ) {
        turnBoundarySeen = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    expect(turnBoundarySeen).toBe(true);
    expect((await harness.waitForResponse(3)).error).toBeUndefined();
    expect(
      agentTitles(harness.messages).filter((title) =>
        /^\s*<system(?:_instructions|[-_]reminder)>/iu.test(title),
      ),
    ).toEqual([]);

    harness.sendRequest(4, "thread/stop", {
      threadId: "thr_live_title",
      intent: "release",
    });
    await harness.waitForResponse(4);
  } finally {
    harness.restore();
    process.stdout.write = originalWrite;
  }
}, 120_000);
