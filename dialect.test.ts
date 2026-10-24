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

  it("declares usage unsupported: kimi exposes no account quota interface", async () => {
    await expect(kimiAcpDialect.maintenance?.readUsage()).resolves.toEqual({
      supported: false,
    });
  });

  it("points terminal login at `kimi login`", () => {
    expect(kimiAcpDialect.maintenance?.loginCommand).toBe("kimi login");
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

  it("classifies kimi's AgentSwarm tool call as a delegation", () => {
    const classified = kimiAcpDialect.classifyToolCall?.({
      sessionUpdate: "tool_call",
      toolCallId: "0:tool_4",
      title: "AgentSwarm",
      kind: "other",
      status: "pending",
    });
    expect(classified?.item).toEqual({
      type: "delegation",
      childRef: "0:tool_4",
      label: "AgentSwarm",
      background: false,
    });
  });

  it("labels the swarm delegation from its description and counts the items", () => {
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
    expect(classified?.item).toEqual({
      type: "delegation",
      childRef: "0:tool_4",
      label: "Compute two expressions",
      background: false,
    });
    expect(classified?.presentation.detail).toBe("2 tasks");
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
