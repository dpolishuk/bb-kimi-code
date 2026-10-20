import { expect, it } from "vitest";

it("exports the published ACP bridge as the plugin's provider bridge", async () => {
  const hostEntry = await import("./host.js");
  const bridge = hostEntry.experimental_providerBridge;
  expect(bridge).toBeDefined();
  expect(bridge.experimental_apiVersion).toBe(1);
  expect(typeof bridge.handleLine).toBe("function");
});
