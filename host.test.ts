import { experimental_createBridgeJsonRpcTestHarness as createBridgeJsonRpcTestHarness } from "@get-bb/plugin-sdk/provider-bridge/testing";
import { expect, it } from "vitest";

it("exports the published ACP bridge as the plugin's provider bridge", async () => {
  const hostEntry = await import("./host.js");
  const bridge = hostEntry.experimental_providerBridge;
  expect(bridge).toBeDefined();
  expect(bridge.experimental_apiVersion).toBe(1);
  expect(typeof bridge.handleLine).toBe("function");
});

it("narrowes the initialize handshake to the declared fork capability (none)", async () => {
  // The SDK's ACP bridge hardcodes `fork: "tip"` in its initialize response
  // regardless of the agent; kimi >= 2.3.0 cannot fork live sessions, the
  // declaration says "none", and handshake facts may only narrow the
  // declaration — so the plugin rewrites fork in the initialize response.
  const hostEntry = await import("./host.js");
  const harness = createBridgeJsonRpcTestHarness(hostEntry.experimental_providerBridge.handleLine);
  try {
    harness.sendRequest(1, "initialize", {
      client: { name: "host-test", version: "0.1.0" },
      protocolVersion: 2,
    });
    const response = await harness.waitForResponse(1);
    expect(response.error).toBeUndefined();
    const capabilities = (response.result as { capabilities: Record<string, unknown> }).capabilities;
    expect(capabilities.fork).toBe("none");
    // Everything else in the SDK response passes through untouched.
    expect(capabilities.approvalEnforcedBy).toBe("runtime");
    expect(capabilities.grammarVersions).toEqual([3, 3]);
    expect(capabilities.skills).toEqual({ configure: true });
  } finally {
    harness.restore();
  }
});
