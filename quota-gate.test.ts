import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProviderUsageResult } from "@get-bb/plugin-sdk/provider-bridge";

import { gateQuotaExhaustedTurns } from "./src/quota-gate.js";

// The gate exists because kimi's acp-server answers a quota-exhausted (429)
// prompt with a bare `stopReason: "end_turn"` and zero session updates — the
// failure is invisible on the ACP wire, so bb renders "The agent ended the
// turn without replying". The gate reads the same OAuth usage endpoint the
// maintenance dialect already uses and fails the turn fast with a typed
// rateLimited recovery hint while a window is fully spent.

const TURN_START_LINE = JSON.stringify({
  jsonrpc: "2.0",
  id: 7,
  method: "turn/start",
  params: {
    threadId: "thr_1",
    providerThreadId: "session_1",
    clientRequestId: "creq abcdefghij0123",
    input: [{ type: "text", text: "Создай новый pr" }],
    options: {},
  },
});

function bridgeRecorder() {
  const lines: string[] = [];
  return {
    lines,
    handleLine(line: string) {
      lines.push(line);
    },
  };
}

function okUsage(windows: Array<{ label: string; usedPercent: number; resetsAt: string | null }>): ProviderUsageResult {
  return {
    supported: true,
    usage: { accountEmail: null, planLabel: null, status: "ok", windows },
  };
}

function capturedStdout() {
  const writes: string[] = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation(((chunk: Uint8Array | string) => {
    writes.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  }) as typeof process.stdout.write);
  return {
    writes,
    jsonLines() {
      return writes
        .flatMap((w) => w.split("\n"))
        .filter((l) => l.trim() !== "")
        .map((l) => JSON.parse(l) as Record<string, unknown>);
    },
    restore() {
      spy.mockRestore();
    },
  };
}

describe("gateQuotaExhaustedTurns", () => {
  let stdout: ReturnType<typeof capturedStdout>;

  beforeEach(() => {
    stdout = capturedStdout();
  });

  afterEach(() => {
    stdout.restore();
  });

  it("fails turn/start fast with a rateLimited recovery hint when a window is exhausted", async () => {
    const bridge = bridgeRecorder();
    const wrapped = gateQuotaExhaustedTurns(bridge, {
      readUsage: async () =>
        okUsage([
          { label: "5h limit", usedPercent: 11.25, resetsAt: "2026-11-01T16:58:56Z" },
          { label: "Weekly limit", usedPercent: 100, resetsAt: "2999-01-01T00:00:00Z" },
        ]),
    });

    wrapped.handleLine(TURN_START_LINE);
    await vi.waitFor(() => expect(stdout.jsonLines().length).toBeGreaterThan(0));

    expect(bridge.lines).toEqual([]);
    const response = stdout.jsonLines()[0]! as {
      id: number;
      error: { code: number; message: string; data?: { recovery?: { kind: string; retryable: boolean } } };
    };
    expect(response.id).toBe(7);
    expect(response.error.code).toBe(-32000);
    expect(response.error.data?.recovery?.kind).toBe("rateLimited");
    expect(response.error.data?.recovery?.retryable).toBe(true);
    expect(response.error.message).toContain("Weekly limit");
  });

  it("names the soonest-resetting exhausted window when several are spent", async () => {
    const bridge = bridgeRecorder();
    const wrapped = gateQuotaExhaustedTurns(bridge, {
      readUsage: async () =>
        okUsage([
          { label: "5h limit", usedPercent: 100, resetsAt: "2999-01-01T00:00:00Z" },
          { label: "Weekly limit", usedPercent: 100, resetsAt: "2999-01-02T00:00:00Z" },
        ]),
    });

    wrapped.handleLine(TURN_START_LINE);
    await vi.waitFor(() => expect(stdout.jsonLines().length).toBeGreaterThan(0));

    const response = stdout.jsonLines()[0]! as { error: { message: string } };
    expect(response.error.message).toContain("5h limit");
  });

  it("forwards the turn when usage has capacity left", async () => {
    const bridge = bridgeRecorder();
    const wrapped = gateQuotaExhaustedTurns(bridge, {
      readUsage: async () =>
        okUsage([{ label: "Weekly limit", usedPercent: 42, resetsAt: "2999-01-01T00:00:00Z" }]),
    });

    wrapped.handleLine(TURN_START_LINE);
    await vi.waitFor(() => expect(bridge.lines).toEqual([TURN_START_LINE]));
    expect(stdout.jsonLines()).toEqual([]);
  });

  it("forwards the turn when the usage endpoint cannot answer", async () => {
    const bridge = bridgeRecorder();
    const wrapped = gateQuotaExhaustedTurns(bridge, {
      readUsage: async () => ({
        supported: true,
        usage: { accountEmail: null, planLabel: null, status: "error", message: "HTTP 500" },
      }),
    });

    wrapped.handleLine(TURN_START_LINE);
    await vi.waitFor(() => expect(bridge.lines).toEqual([TURN_START_LINE]));
    expect(stdout.jsonLines()).toEqual([]);
  });

  it("forwards the turn when the exhausted window has already reset (stale ratio)", async () => {
    const bridge = bridgeRecorder();
    const wrapped = gateQuotaExhaustedTurns(bridge, {
      readUsage: async () =>
        okUsage([{ label: "Weekly limit", usedPercent: 100, resetsAt: "2000-01-01T00:00:00Z" }]),
    });

    wrapped.handleLine(TURN_START_LINE);
    await vi.waitFor(() => expect(bridge.lines).toEqual([TURN_START_LINE]));
    expect(stdout.jsonLines()).toEqual([]);
  });

  it("forwards the turn when an exhausted window reports no reset time", async () => {
    const bridge = bridgeRecorder();
    const wrapped = gateQuotaExhaustedTurns(bridge, {
      readUsage: async () =>
        okUsage([{ label: "Weekly limit", usedPercent: 100, resetsAt: null }]),
    });

    wrapped.handleLine(TURN_START_LINE);
    await vi.waitFor(() => expect(bridge.lines).toEqual([TURN_START_LINE]));
    expect(stdout.jsonLines()).toEqual([]);
  });

  it("forwards the turn when the usage check times out", async () => {
    const bridge = bridgeRecorder();
    const wrapped = gateQuotaExhaustedTurns(bridge, {
      readUsage: () => new Promise(() => {}),
      timeoutMs: 20,
    });

    wrapped.handleLine(TURN_START_LINE);
    await vi.waitFor(() => expect(bridge.lines).toEqual([TURN_START_LINE]), { timeout: 2_000 });
    expect(stdout.jsonLines()).toEqual([]);
  });

  it("passes every other request and notification through untouched", () => {
    const bridge = bridgeRecorder();
    const wrapped = gateQuotaExhaustedTurns(bridge, { readUsage: async () => okUsage([]) });

    const lines = [
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
      JSON.stringify({ jsonrpc: "2.0", id: 2, method: "thread/start", params: {} }),
      JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "turn/steer",
        params: { threadId: "thr_1", input: [] },
      }),
      JSON.stringify({ jsonrpc: "2.0", method: "thread/stop", params: { threadId: "thr_1" } }),
      "not json",
    ];
    for (const line of lines) {
      wrapped.handleLine(line);
    }

    expect(bridge.lines).toEqual(lines);
    expect(stdout.writes).toEqual([]);
  });

  it("returns the bridge untouched when disabled (BB_KIMI_QUOTA_GATE=0)", async () => {
    const bridge = bridgeRecorder();
    const wrapped = gateQuotaExhaustedTurns(bridge, {
      enabled: false,
      readUsage: async () =>
        okUsage([{ label: "Weekly limit", usedPercent: 100, resetsAt: "2999-01-01T00:00:00Z" }]),
    });

    wrapped.handleLine(TURN_START_LINE);

    expect(bridge.lines).toEqual([TURN_START_LINE]);
    await new Promise((r) => setTimeout(r, 10));
    expect(stdout.writes).toEqual([]);
  });
});
