import { experimental_createBridgeJsonRpcTestHarness as createBridgeJsonRpcTestHarness } from "@get-bb/plugin-sdk/provider-bridge/testing";
import { expect, it } from "vitest";

// Live probe of the bridge's model/list answer: the reasoning picker in bb
// renders from this catalog, so assert the thinking levels survive into it.
const LIVE = process.env.BB_KIMI_LIVE === "1";
const itLive = LIVE ? it : it.skip;

itLive("model/list carries kimi thinking levels per model", async () => {
  const { experimental_providerBridge: bridge } = await import("./host.js");
  const harness = createBridgeJsonRpcTestHarness(bridge.handleLine);
  try {
    harness.sendRequest(1, "initialize", {
      client: { name: "kimi-live-test", version: "0.1.0" },
      protocolVersion: 2,
    });
    await harness.waitForResponse(1);

    harness.sendRequest(2, "model/list", {
      providerId: "kimi-code",
      providerOptions: {
        acpDialect: "kimi",
        acpLaunchSpec: {
          displayName: "Kimi Code",
          command: "kimi",
          args: ["acp"],
          env: {},
        },
      },
    });
    const response = await harness.waitForResponse(2);
    expect(response.error).toBeUndefined();
    console.info(
      `=== model/list ===\n${JSON.stringify(response.result, null, 1)}\n=== END ===`,
    );
    const result = response.result as {
      models: Array<{
        id: string;
        supportedReasoningEfforts: Array<{ reasoningEffort: string }>;
        defaultReasoningEffort: string;
      }>;
    };
    expect(result.models.length).toBeGreaterThan(0);
    for (const model of result.models) {
      expect(
        model.supportedReasoningEfforts.length,
        `model ${model.id}`,
      ).toBeGreaterThan(0);
    }
    // K3-class models expose the full thinking ladder; older ones
    // (K2.7 Highspeed) expose an on/high toggle — both are kimi's own truth.
    const k3 = result.models.find((model) => model.id === "kimi-code/k3");
    expect(k3).toBeDefined();
    expect(
      k3?.supportedReasoningEfforts.map((effort) => effort.reasoningEffort),
    ).toEqual(["low", "high", "max"]);
  } finally {
    harness.restore();
  }
}, 120_000);
