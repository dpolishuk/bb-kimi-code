import { experimental_captureBridgeJsonRpcOutput as captureBridgeJsonRpcOutput } from "@get-bb/plugin-sdk/provider-bridge/testing";
import { describe, expect, it } from "vitest";

import { suppressHarnessAgentTitlesOnBridge } from "./src/agent-title-filter.js";

const BRIDGE_CONTEXT = {
  pluginId: "kimi-code",
  dataDir: "/tmp/kimi-title-filter-data",
  tempDir: "/tmp/kimi-title-filter-temp",
};

function titleNotification(deltas: unknown[]): string {
  return `${JSON.stringify({
    jsonrpc: "2.0",
    method: "thread/delta",
    params: { threadId: "thr_title_test", deltas },
  })}\n`;
}

function runBridge(outputLine: string) {
  const output = captureBridgeJsonRpcOutput();
  const bridge = suppressHarnessAgentTitlesOnBridge({
    handleLine(_line: string) {
      process.stdout.write(outputLine);
    },
  });
  try {
    bridge.start?.(BRIDGE_CONTEXT);
    bridge.handleLine("");
    return output.messages;
  } finally {
    bridge.onClose?.();
    output.restore();
  }
}

describe("Kimi agent title filtering", () => {
  it("suppresses a harness-derived agent title before it reaches bb", () => {
    const messages = runBridge(
      titleNotification([
        {
          kind: "thread.name",
          name: "<system_instructions> If the user asks you to move this thread",
          source: "agent",
        },
      ]),
    );

    expect(messages).toEqual([]);
  });

  it("keeps genuine titles and unrelated deltas while filtering harness variants", () => {
    const genuineTitle = {
      kind: "thread.name",
      name: "Fix <system_instructions> title leaks",
      source: "agent",
    };
    const threadStarted = { kind: "thread.started" };
    const messages = runBridge(
      titleNotification([
        genuineTitle,
        {
          kind: "thread.name",
          name: "<system-reminder> Today's date is hidden",
          source: "agent",
        },
        threadStarted,
      ]),
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      params: { deltas: [genuineTitle, threadStarted] },
    });
  });
});
