import { describe, expect, it } from "vitest";

import { mapPlanPromptMode } from "./src/prompt-mode.js";

function bridgeRecorder() {
  const lines: string[] = [];
  return {
    lines,
    handleLine(line: string) {
      lines.push(line);
    },
  };
}

describe("mapPlanPromptMode", () => {
  it("turns promptMode plan into a mode config update before the turn", () => {
    const bridge = bridgeRecorder();
    const wrapped = mapPlanPromptMode(bridge);
    wrapped.handleLine(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "turn/start",
        params: {
          threadId: "thr_1",
          providerThreadId: "session_1",
          input: [],
          options: { promptMode: "plan" },
        },
      }),
    );

    expect(bridge.lines).toHaveLength(1);
    const forwarded = JSON.parse(bridge.lines[0]!);
    expect(forwarded.params.options.sessionOptions).toEqual({ mode: "plan" });
  });

  it("passes a JSON null request through for the SDK to reject", () => {
    const bridge = bridgeRecorder();
    const wrapped = mapPlanPromptMode(bridge);

    expect(() => wrapped.handleLine("null")).not.toThrow();
    expect(bridge.lines).toEqual(["null"]);
  });

  it("does not inject the update for other prompt modes", () => {
    const bridge = bridgeRecorder();
    const wrapped = mapPlanPromptMode(bridge);
    const line = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "turn/start",
      params: { threadId: "thr_1", providerThreadId: "session_1", input: [], options: {} },
    });
    wrapped.handleLine(line);
    expect(bridge.lines).toEqual([line]);
  });
});
