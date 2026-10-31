import { describe, expect, it } from "vitest";

import { kimiAcpDialect } from "./src/dialect.js";

describe("the kimi ACP dialect maintenance hooks", () => {
  it("installs kimi through the official install script", () => {
    const plan = kimiAcpDialect.maintenance?.installer();
    expect(plan?.displayCommand).toContain("code.kimi.com/kimi-code/install");
  });

  it("reads a valid OAuth credential as authenticated", async () => {
    const { readKimiAccount } = await import("./src/kimi-account.js");
    const now = Date.now();
    const credentials = JSON.stringify({
      access_token: "token",
      refresh_token: "refresh",
      expires_at: Math.floor(now / 1000) + 3600,
    });
    expect(readKimiAccount({ credentials, configToml: undefined, now })).toEqual({
      email: null,
    });
  });

  it("treats an expired token with a refresh token as authenticated", async () => {
    const { readKimiAccount } = await import("./src/kimi-account.js");
    const now = Date.now();
    const credentials = JSON.stringify({
      access_token: "token",
      refresh_token: "refresh",
      expires_at: Math.floor(now / 1000) - 3600,
    });
    expect(readKimiAccount({ credentials, configToml: undefined, now })).toEqual({
      email: null,
    });
  });

  it("treats an expired token without a refresh token as unauthenticated", async () => {
    const { readKimiAccount } = await import("./src/kimi-account.js");
    const now = Date.now();
    const credentials = JSON.stringify({
      access_token: "token",
      expires_at: Math.floor(now / 1000) - 3600,
    });
    expect(
      readKimiAccount({ credentials, configToml: undefined, now }),
    ).toBeNull();
  });

  it("treats a configured provider api_key as authenticated", async () => {
    const { readKimiAccount } = await import("./src/kimi-account.js");
    expect(
      readKimiAccount({
        credentials: undefined,
        configToml: '[providers.custom]\napi_key = "sk-test"\n',
        now: Date.now(),
      }),
    ).toEqual({ email: null });
  });

  it("treats missing or malformed credentials as unauthenticated", async () => {
    const { readKimiAccount } = await import("./src/kimi-account.js");
    expect(
      readKimiAccount({ credentials: undefined, configToml: undefined, now: Date.now() }),
    ).toBeNull();
    expect(
      readKimiAccount({ credentials: "not json", configToml: undefined, now: Date.now() }),
    ).toBeNull();
  });

  it("reports no account email: kimi OAuth tokens carry no email claim", async () => {
    // Verified 2026-10-20: credentials/kimi-code.json is a bare OAuth token
    // set; the access token JWT claims are client_id, device_id, exp, iat,
    // iss, jti, nbf, scope, sub, token_id, type, user_id — no email.
    await expect(kimiAcpDialect.maintenance?.readAccount()).resolves.toEqual({
      email: null,
    });
  });

  it("declares usage through the OAuth endpoint", async () => {
    const { vi } = await import("vitest");
    vi.stubGlobal(
      "fetch",
      async () => new Response(JSON.stringify({ usages: {} }), { status: 200 }),
    );
    try {
      await expect(kimiAcpDialect.maintenance?.readUsage()).resolves.toEqual({
        supported: true,
        usage: {
          accountEmail: null,
          planLabel: null,
          status: "ok",
          windows: [],
        },
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("points terminal login at `kimi login`", () => {
    expect(kimiAcpDialect.maintenance?.loginCommand).toBe("kimi login");
  });

  it("maps managed quota into bb usage windows with reset times and booster cost", async () => {
    const { readKimiUsage } = await import("./src/kimi-usage.js");
    const result = await readKimiUsage({
      credentials: JSON.stringify({ access_token: "token" }),
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            usages: {
              limit_5h: { used_ratio: 0.5, reset_time: "2026-10-28T12:00:00Z" },
              limit_7d: { used_ratio: 0.25 },
              limit_month_total: { used_ratio: 0.1 },
              limit_month_code: { used_ratio: 0.2 },
            },
            boosterWallet: {
              balance: { type: "BOOSTER", amount: 100000, amountLeft: 50000 },
              monthlyChargeLimit: { priceInCents: 200000, currency: "USD" },
              monthlyUsed: { priceInCents: 50000, currency: "USD" },
              monthlyChargeLimitEnabled: true,
            },
          }),
          { status: 200 },
        ),
    });

    expect(result.supported).toBe(true);
    const usage = (result as { usage: { status: string; windows: unknown[] } }).usage;
    expect(usage.status).toBe("ok");
    expect(usage.windows).toHaveLength(5);
    expect(usage.windows[0]).toMatchObject({
      label: "5h limit",
      resetsAt: "2026-10-28T12:00:00Z",
      usedPercent: 50,
    });
    expect(usage.windows[4]).toMatchObject({
      cost: { limitUsdCents: 200000, usedUsdCents: 50000 },
    });
  });

  it("reports unauthenticated when there is no usable token", async () => {
    const { readKimiUsage } = await import("./src/kimi-usage.js");
    const result = await readKimiUsage({ credentials: "{}" });
    expect(result).toEqual({ supported: true, usage: { status: "unauthenticated" } });
  });

  it("maps 401 to expired and other HTTP failures to error", async () => {
    const { readKimiUsage } = await import("./src/kimi-usage.js");
    const credentials = JSON.stringify({ access_token: "token" });
    const unauthorized = await readKimiUsage({
      credentials,
      fetchImpl: async () => new Response("nope", { status: 401 }),
    });
    expect(unauthorized).toEqual({ supported: true, usage: { status: "expired" } });
    const failure = await readKimiUsage({
      credentials,
      fetchImpl: async () => new Response("nope", { status: 500 }),
    });
    expect((failure as { usage: { status: string } }).usage.status).toBe("error");
  });

  it("maps network failures to error", async () => {
    const { readKimiUsage } = await import("./src/kimi-usage.js");
    const result = await readKimiUsage({
      credentials: JSON.stringify({ access_token: "token" }),
      fetchImpl: async () => {
        throw new Error("offline");
      },
    });
    expect((result as { usage: { status: string; message: string } }).usage).toMatchObject({
      status: "error",
      message: "offline",
    });
  });
});

describe("the kimi ACP dialect command output normalization", () => {
  // Event shapes below are copied from the live recording of kimi acp 2.4.1
  // (BB_PROVIDER_BRIDGE_RECORD_DIR probe, 2026-10-31): a Bash call streams
  // cumulative argument-JSON snapshots as content text, then an in_progress
  // update carries rawInput with content === JSON.stringify(rawInput), and
  // only afterwards the real command output arrives (with rawOutput).
  const normalize = (event: Parameters<NonNullable<typeof kimiAcpDialect.normalizeCommandEvent>>[0]) =>
    kimiAcpDialect.normalizeCommandEvent?.(event) ?? event;

  const argsSnapshot = (text: string, toolCallId = "0:tool_bash1") => ({
    sessionUpdate: "tool_call_update" as const,
    toolCallId,
    status: "in_progress" as const,
    content: [{ type: "content" as const, content: { type: "text" as const, text } }],
  });

  it("strips cumulative argument-JSON snapshots before rawInput arrives", () => {
    const normalized = normalize(argsSnapshot('{"command": "echo hello-probe"'));
    expect(normalized.content).toBeUndefined();
  });

  it("strips the exact argument echo on the update that carries rawInput", () => {
    const rawInput = { command: "echo hello-probe" };
    const normalized = normalize({
      ...argsSnapshot(JSON.stringify(rawInput)),
      title: "Running: echo hello-probe",
      kind: "execute",
      rawInput,
    });
    expect(normalized.content).toBeUndefined();
    expect(normalized.rawInput).toEqual(rawInput);
  });

  it("passes real output through once rawInput was seen, even without rawInput on the event", () => {
    const rawInput = { command: "echo hello-probe" };
    normalize({ ...argsSnapshot(JSON.stringify(rawInput)), rawInput });
    const output = argsSnapshot("hello-probe\n");
    expect(normalize(output)).toEqual(output);
  });

  it("keeps real JSON command output at close", () => {
    const rawInput = { command: "printf '{\"issues\":[1,2]}\\n'" };
    const completed = {
      ...argsSnapshot('{"issues":[1,2]}\n'),
      status: "completed" as const,
      rawInput,
      rawOutput: '{"issues":[1,2]}\n',
    };
    expect(normalize(completed)).toEqual(completed);
  });

  it("strips a close whose only content is the argument echo", () => {
    const rawInput = { command: "true" };
    const completed = {
      ...argsSnapshot(JSON.stringify(rawInput)),
      status: "completed" as const,
      rawInput,
    };
    expect(normalize(completed).content).toBeUndefined();
  });

  it("tracks argument echo state per tool call", () => {
    const first = { command: "echo one" };
    normalize({ ...argsSnapshot(JSON.stringify(first), "0:tool_a"), rawInput: first });
    // A different call is still in its argument-streaming phase.
    expect(normalize(argsSnapshot('{"command": "echo two', "0:tool_b")).content).toBeUndefined();
    // While the first call already passes real output through.
    const output = argsSnapshot("one\n", "0:tool_a");
    expect(normalize(output)).toEqual(output);
  });

  it("resets the echo state after a terminal update", () => {
    const rawInput = { command: "echo hello-probe" };
    const id = "0:tool_reset";
    normalize({ ...argsSnapshot(JSON.stringify(rawInput), id), rawInput });
    normalize({ ...argsSnapshot("hello-probe\n", id), status: "completed" as const, rawOutput: "hello-probe\n" });
    expect(normalize(argsSnapshot('{"command": "echo again', id)).content).toBeUndefined();
  });
});

describe("the kimi ACP dialect tool call event normalization (non-command)", () => {
  // Event shapes mirror the Agent call in recordings/agent-delegation.ndjson:
  // argument snapshots stream as content text, the rawInput transition echoes
  // JSON.stringify(rawInput), and the real result only arrives afterwards.
  const normalize = (event: Parameters<NonNullable<typeof kimiAcpDialect.normalizeToolCallEvent>>[0]) =>
    kimiAcpDialect.normalizeToolCallEvent?.(event) ?? event;

  const agentSnapshot = (text: string, toolCallId = "0:tool_agent1") => ({
    sessionUpdate: "tool_call_update" as const,
    toolCallId,
    status: "in_progress" as const,
    content: [{ type: "content" as const, content: { type: "text" as const, text } }],
  });

  it("strips Agent argument snapshots before rawInput arrives", () => {
    expect(normalize(agentSnapshot('{"prompt": "Compute')).content).toBeUndefined();
  });

  it("strips the exact argument echo on the Agent launch update", () => {
    const rawInput = { prompt: "Compute 2+2", description: "Compute simple arithmetic" };
    const normalized = normalize({
      ...agentSnapshot(JSON.stringify(rawInput)),
      title: "Launching coder agent: Compute simple arithmetic",
      kind: "other",
      rawInput,
    });
    expect(normalized.content).toBeUndefined();
    expect(normalized.rawInput).toEqual(rawInput);
  });

  it("passes the subagent result at close", () => {
    const rawInput = { prompt: "Compute 2+2", description: "Compute simple arithmetic" };
    const completed = {
      ...agentSnapshot("2"),
      status: "completed" as const,
      rawInput,
    };
    expect(normalize(completed)).toEqual(completed);
  });
});

describe("the kimi ACP dialect subagent classification", () => {
  // Event shapes below are copied from the live recording of kimi acp 2.3.0
  // (/tmp probe, 2026-10-23, kimi-live.delegation.test.ts): the Agent tool
  // opens with title "Agent" and no input, then an in_progress update carries
  // the title "Launching <type> agent: <description>" and the structured
  // rawInput { prompt, description }.
  it("classifies kimi's Agent tool call as a delegation", () => {
    const classified = kimiAcpDialect.classifyToolCall?.({
      sessionUpdate: "tool_call",
      toolCallId: "0:tool_1",
      title: "Agent",
      kind: "other",
      status: "pending",
    });
    expect(classified?.item).toEqual({
      type: "delegation",
      childRef: "0:tool_1",
      label: "Agent",
      background: false,
    });
  });

  it("labels the delegation from rawInput description once it streams in", () => {
    const classified = kimiAcpDialect.classifyToolCall?.({
      sessionUpdate: "tool_call_update",
      toolCallId: "0:tool_1",
      title: "Launching coder agent: Compute 2+2",
      kind: "other",
      status: "in_progress",
      rawInput: {
        prompt: "Compute 2+2 and reply with just the number",
        description: "Compute 2+2",
      },
    });
    expect(classified?.item).toEqual({
      type: "delegation",
      childRef: "0:tool_1",
      label: "Compute 2+2",
      background: false,
    });
    expect(classified?.presentation.detail).toBe("coder");
  });

  it("leaves non-Agent tools to the generic classifier", () => {
    expect(
      kimiAcpDialect.classifyToolCall?.({
        sessionUpdate: "tool_call",
        toolCallId: "0:tool_2",
        title: "Read",
        kind: "read",
        status: "pending",
      }),
    ).toBeUndefined();
    expect(
      kimiAcpDialect.classifyToolCall?.({
        sessionUpdate: "tool_call",
        toolCallId: "0:tool_3",
        title: "Agentation", // merely contains "Agent" as a substring
        kind: "other",
        status: "pending",
      }),
    ).toBeUndefined();
  });

  it("classifies kimi's AgentSwarm tool call as a workflow of its items", () => {
    const classified = kimiAcpDialect.classifyToolCall?.({
      sessionUpdate: "tool_call",
      toolCallId: "0:tool_4",
      title: "AgentSwarm",
      kind: "other",
      status: "pending",
    });
    expect(classified?.item).toMatchObject({
      type: "backgroundTask",
      taskStatus: "running",
      status: "pending",
      workflow: {
        phases: [{ index: 0, title: "Swarm" }],
        agents: [],
      },
    });
  });

  it("labels the swarm workflow from its description and items", () => {
    const classified = kimiAcpDialect.classifyToolCall?.({
      sessionUpdate: "tool_call_update",
      toolCallId: "0:tool_4",
      title: "Launching agent swarm: Compute two expressions",
      kind: "other",
      status: "in_progress",
      rawInput: {
        description: "Compute two expressions",
        prompt_template: "Compute the expression in the item: {{item}}",
        items: ["Compute 2+2", "Compute 3+3"],
      },
    });
    expect(classified?.item).toMatchObject({
      type: "backgroundTask",
      description: "Compute two expressions",
      taskStatus: "running",
      workflow: {
        agents: [
          { index: 0, label: "Compute 2+2", state: "queued" },
          { index: 1, label: "Compute 3+3", state: "queued" },
        ],
      },
    });
  });

  it("marks every swarm item done when the swarm completes", () => {
    const classified = kimiAcpDialect.classifyToolCall?.({
      sessionUpdate: "tool_call_update",
      toolCallId: "0:tool_4",
      title: "Launching agent swarm: Compute two expressions",
      kind: "other",
      status: "completed",
      rawInput: {
        description: "Compute two expressions",
        items: ["Compute 2+2", "Compute 3+3"],
      },
    });
    expect(classified?.item).toMatchObject({
      type: "backgroundTask",
      taskStatus: "completed",
      status: "completed",
      workflow: {
        agents: [
          { index: 0, state: "done" },
          { index: 1, state: "done" },
        ],
      },
    });
  });

  it("does not confuse the Agent and AgentSwarm launch titles", () => {
    const swarm = kimiAcpDialect.classifyToolCall?.({
      sessionUpdate: "tool_call_update",
      toolCallId: "0:tool_5",
      title: "Launching agent swarm: two tasks",
      kind: "other",
      status: "in_progress",
      rawInput: { description: "two tasks", items: ["a", "b"] },
    });
    expect(swarm?.presentation.detail).toBe("2 tasks");
    const agent = kimiAcpDialect.classifyToolCall?.({
      sessionUpdate: "tool_call_update",
      toolCallId: "0:tool_6",
      title: "Launching coder agent: one task",
      kind: "other",
      status: "in_progress",
      rawInput: { description: "one task" },
    });
    expect(agent?.presentation.detail).toBe("coder");
  });
});
