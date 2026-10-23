import {
  experimental_captureBridgeJsonRpcOutput as captureBridgeJsonRpcOutput,
  experimental_createBridgeJsonRpcTestHarness as createBridgeJsonRpcTestHarness,
} from "@get-bb/plugin-sdk/provider-bridge/testing";
import { expect, it } from "vitest";

// Live integration test for the kimi dialect maintenance surface. Reads the
// real ~/.kimi-code credential state and probes the real kimi binary, so it
// runs only when BB_KIMI_LIVE=1 is set explicitly.
const LIVE = process.env.BB_KIMI_LIVE === "1";
const itLive = LIVE ? it : it.skip;

const PROVIDER_OPTIONS = {
  acpDialect: "kimi",
  acpLaunchSpec: {
    displayName: "Kimi Code",
    command: "kimi",
    args: ["acp"],
    env: {},
  },
};

itLive("reports health, installation, and usage through the kimi dialect", async () => {
  const { experimental_providerBridge: bridge } = await import("./host.js");
  const harness = createBridgeJsonRpcTestHarness(bridge.handleLine);
  try {
    harness.sendRequest(1, "initialize", {
      client: { name: "kimi-live-test", version: "0.1.0" },
      protocolVersion: 2,
    });
    await harness.waitForResponse(1);

    harness.sendRequest(2, "provider/health", {
      providerId: "kimi-code",
      providerOptions: PROVIDER_OPTIONS,
    });
    const health = await harness.waitForResponse(2);
    expect(health.error).toBeUndefined();
    const healthResult = health.result as {
      health: {
        status: string;
        installedVersion: string | null;
        loginCommand: string | null;
        canInstall: boolean;
      };
    };
    expect(healthResult.health.status).toBe("ready");
    // The CLI self-updates (2.2.0 -> 2.3.0 landed unprompted), so an exact
    // version pin breaks on every update; health must report a real semver.
    expect(healthResult.health.installedVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(healthResult.health.loginCommand).toBe("kimi login");
    expect(healthResult.health.canInstall).toBe(true);

    harness.sendRequest(3, "provider/installation/status", {
      providerId: "kimi-code",
      providerOptions: {
        acpDialect: "kimi",
        acpLaunchSpec: { ...PROVIDER_OPTIONS.acpLaunchSpec, command: "kimi-not-installed" },
      },
    });
    const status = await harness.waitForResponse(3);
    expect(status.error).toBeUndefined();
    const statusResult = status.result as {
      installed: boolean;
      installAction: { command: string } | null;
    };
    expect(statusResult.installed).toBe(false);
    expect(statusResult.installAction?.command).toContain(
      "code.kimi.com/kimi-code/install",
    );

    harness.sendRequest(4, "provider/usage", {
      providerId: "kimi-code",
      providerOptions: PROVIDER_OPTIONS,
    });
    const usage = await harness.waitForResponse(4);
    expect(usage.error).toBeUndefined();
    expect(usage.result).toEqual({ supported: false });
  } finally {
    harness.restore();
  }
}, 60_000);
