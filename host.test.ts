import { experimental_createBridgeJsonRpcTestHarness as createBridgeJsonRpcTestHarness } from "@get-bb/plugin-sdk/provider-bridge/testing";
import { expect, it } from "vitest";

it("exports the published ACP bridge as the plugin's provider bridge", async () => {
  const hostEntry = await import("./host.js");
  const bridge = hostEntry.experimental_providerBridge;
  expect(bridge).toBeDefined();
  expect(bridge.experimental_apiVersion).toBe(1);
  expect(typeof bridge.handleLine).toBe("function");
});

it("exports the published ACP bridge with live-source fork handoff", async () => {
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
    expect(capabilities.fork).toBe("tip");
    // Everything else in the SDK response passes through untouched.
    expect(capabilities.approvalEnforcedBy).toBe("runtime");
    expect(capabilities.grammarVersions).toEqual([3, 3]);
    expect(capabilities.skills).toEqual({ configure: true });
  } finally {
    harness.restore();
  }
});
