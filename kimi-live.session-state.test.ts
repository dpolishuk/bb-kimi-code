import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { experimental_createBridgeJsonRpcTestHarness as createBridgeJsonRpcTestHarness } from "@get-bb/plugin-sdk/provider-bridge/testing";
import { afterEach, beforeEach, expect, it } from "vitest";

// Live integration test: real `kimi acp` child, no prompt is sent (thread/start
// only), so no model tokens are spent. Still needs the kimi binary and a valid
// login, so it runs only when BB_KIMI_LIVE=1 is set explicitly.
const LIVE = process.env.BB_KIMI_LIVE === "1";

let workspaceDir: string;

beforeEach(() => {
  workspaceDir = mkdtempSync(join(tmpdir(), "bb-kimi-state-"));
});

afterEach(() => {
  rmSync(workspaceDir, { recursive: true, force: true });
});

const itLive = LIVE ? it : it.skip;

const PROVIDER_OPTIONS = {
  acpLaunchSpec: {
    displayName: "Kimi Code",
    command: "kimi",
    args: ["acp"],
    env: {},
  },
};

function collectStateKinds(messages: unknown[]): Map<string, unknown> {
  const states = new Map<string, unknown>();
  for (const message of messages) {
    if (typeof message !== "object" || message === null) continue;
    const { method, params } = message as {
      method?: string;
      params?: { deltas?: Array<{ kind?: string; extensionKind?: string; payload?: unknown }> };
    };
    if (method !== "thread/delta" || !Array.isArray(params?.deltas)) continue;
    for (const delta of params.deltas) {
      if (delta.kind === "extension.state" && typeof delta.extensionKind === "string") {
        states.set(delta.extensionKind, delta.payload);
      }
    }
  }
  return states;
}

itLive("publishes kimi slash commands and session options as bb thread state", async () => {
  const { experimental_providerBridge: bridge } = await import("./host.js");
  const harness = createBridgeJsonRpcTestHarness(bridge.handleLine);
  try {
    harness.sendRequest(1, "initialize", {
      client: { name: "kimi-live-test", version: "0.1.0" },
      protocolVersion: 2,
    });
    const initResponse = await harness.waitForResponse(1);
    expect(initResponse.error).toBeUndefined();

    harness.sendRequest(2, "thread/start", {
      threadId: "thr_live_state",
      cwd: workspaceDir,
      instructionMode: "replace",
      options: {
        permissionMode: "full",
        permissionScope: "full",
        approvalReviewer: null,
        permissionEscalation: null,
        providerOptions: PROVIDER_OPTIONS,
      },
    });
    const startResponse = await harness.waitForResponse(2);
    expect(startResponse.error).toBeUndefined();

    const deadline = Date.now() + 60_000;
    let states = collectStateKinds(harness.messages);
    while (
      Date.now() < deadline &&
      !(states.has("bb/session-options") && states.has("bb/provider-commands"))
    ) {
      await harness.flushWork();
      await new Promise((resolve) => setTimeout(resolve, 200));
      states = collectStateKinds(harness.messages);
    }

    const commands = states.get("bb/provider-commands") as {
      commands: Array<{ name: string }>;
    };
    expect(
      commands.commands.map((command) => command.name),
    ).toContain("compact");

    const sessionOptions = states.get("bb/session-options") as {
      options: Array<{ id: string; category?: string; values?: Array<{ id: string }> }>;
    };
    const mode = sessionOptions.options.find((option) => option.id === "mode");
    expect(mode).toBeDefined();
    expect(mode?.values?.map((value) => value.id)).toContain("plan");

    harness.sendRequest(3, "thread/stop", {
      threadId: "thr_live_state",
      intent: "release",
    });
    await harness.waitForResponse(3);
  } finally {
    harness.restore();
  }
}, 120_000);
