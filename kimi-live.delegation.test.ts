import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { experimental_createBridgeJsonRpcTestHarness as createBridgeJsonRpcTestHarness } from "@get-bb/plugin-sdk/provider-bridge/testing";
import { afterEach, beforeEach, expect, it } from "vitest";

// Live integration test: a real turn that forces kimi to call its Agent tool
// and asserts the subagent surfaces as a delegation item (not a generic tool
// row) without argument JSON in progress. Spends model tokens, so it runs only
// when BB_KIMI_LIVE=1 is set explicitly. BB_KIMI_COMMAND selects a specific
// binary; BB_KIMI_HOST_ENTRY=./dist/host.js tests the built artifact. Set
// BB_PROVIDER_BRIDGE_RECORD_DIR to record raw ACP child IO for dialect.test.ts.
const LIVE = process.env.BB_KIMI_LIVE === "1";
const itLive = LIVE ? it : it.skip;

let workspaceDir: string;

beforeEach(() => {
  workspaceDir = mkdtempSync(join(tmpdir(), "bb-kimi-delegation-"));
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
      command: process.env.BB_KIMI_COMMAND ?? "kimi",
      args: ["acp"],
      env: {},
    },
  },
};

itLive("surfaces a kimi Agent tool call", async () => {
  const { experimental_providerBridge: bridge } =
    process.env.BB_KIMI_HOST_ENTRY === "./dist/host.js"
      // @ts-expect-error The built bundle does not ship type declarations.
      ? await import("./dist/host.js")
      : await import("./host.js");
  const harness = createBridgeJsonRpcTestHarness(bridge.handleLine);
  try {
    harness.sendRequest(1, "initialize", {
      client: { name: "kimi-live-test", version: "0.1.0" },
      protocolVersion: 2,
    });
    await harness.waitForResponse(1);

    harness.sendRequest(2, "thread/start", {
      threadId: "thr_live_delegation",
      cwd: workspaceDir,
      instructionMode: "replace",
      options: OPTIONS,
    });
    const startResponse = await harness.waitForResponse(2);
    const { providerThreadId } = startResponse.result as { providerThreadId: string };

    harness.sendRequest(3, "turn/start", {
      threadId: "thr_live_delegation",
      providerThreadId,
      clientRequestId: "creq_bbbbbbbbbb",
      input: [
        {
          type: "text",
          text: "Use the Agent tool exactly once: launch a subagent with the prompt 'Compute 2+2 and reply with just the number'. After it returns, reply with exactly: done",
          mentions: [],
        },
      ],
      options: OPTIONS,
    });

    const deadline = Date.now() + 180_000;
    const answeredRequests = new Set<unknown>();
    const itemEvents: Array<Record<string, unknown>> = [];
    let settled = false;
    while (Date.now() < deadline && !settled) {
      await harness.flushWork();
      await new Promise((resolve) => setTimeout(resolve, 500));
      for (const message of harness.messages) {
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
          if (["item.open", "item.close", "item.progress"].includes(delta.kind as string)) {
            itemEvents.push(delta);
          }
          if (delta.kind === "turn.boundary") {
            settled = true;
          }
        }
      }
    }

    const delegationOpen = itemEvents.find(
      (delta) =>
        delta.kind === "item.open" &&
        (delta.item as { type?: string } | undefined)?.type === "delegation",
    );
    expect(
      delegationOpen,
      `expected a delegation item in ${JSON.stringify(itemEvents.map((delta) => (delta.item as { type?: string })?.type))}`,
    ).toBeDefined();
    expect(
      (delegationOpen?.item as { label?: string }).label,
      "delegation label carries the subagent task",
    ).toBeTruthy();
    const delegationKey = (delegationOpen?.key as { providerItemId?: string } | undefined)
      ?.providerItemId;
    const argumentProgress = itemEvents.filter(
      (delta) =>
        delta.kind === "item.progress" &&
        (delta.key as { providerItemId?: string } | undefined)?.providerItemId === delegationKey &&
        typeof delta.message === "string" &&
        delta.message.includes('"prompt"') &&
        delta.message.includes('"description"'),
    );
    expect(argumentProgress, "Agent argument JSON must not reach bb progress").toEqual([]);
    expect(settled).toBe(true);

    // Fixture recording: BB_KIMI_FIXTURE_RECORD=<path> dumps the bridge's
    // outbound notifications as ndjson (workspace path and session id
    // redacted) for the committed replay fixture in fixtures.test.ts.
    const fixturePath = process.env.BB_KIMI_FIXTURE_RECORD;
    if (fixturePath !== undefined) {
      const { writeFileSync, mkdirSync } = await import("node:fs");
      const { dirname } = await import("node:path");
      mkdirSync(dirname(fixturePath), { recursive: true });
      const redact = (text: string) =>
        text
          .split(workspaceDir).join("/tmp/bb-kimi-fixture")
          .split(providerThreadId).join("session_redacted");
      writeFileSync(
        fixturePath,
        harness.messages
          .map((message) => redact(JSON.stringify(message)))
          .join("\n") + "\n",
      );
    }
  } finally {
    harness.restore();
  }
}, 240_000);
