import { experimental_createBridgeJsonRpcTestHarness as createBridgeJsonRpcTestHarness } from "@get-bb/plugin-sdk/provider-bridge/testing";
import { describe, expect, it, vi } from "vitest";

import { withKimiInstallation } from "./src/kimi-installation.js";

const PROVIDER_OPTIONS = {
  acpDialect: "kimi",
  acpLaunchSpec: {
    displayName: "Kimi Code",
    command: "kimi",
    args: ["acp"],
    env: {},
  },
};

function fixture(options: {
  executablePath?: string | null;
  currentVersion?: string | null;
  latestResponse?: Response;
}) {
  const underlying = { handleLine: vi.fn() };
  const readCliVersion = vi.fn(async () => options.currentVersion ?? null);
  const fetchImpl = vi.fn(async () => options.latestResponse ?? new Response("2.5.3\n", { status: 200 }));
  const installer = () => ({
    command: "bash",
    args: ["install-kimi"],
    displayCommand: "install-kimi",
  });
  const bridge = withKimiInstallation(underlying, {
    resolveExecutablePath: async () => options.executablePath === undefined ? "/bin/kimi" : options.executablePath,
    readCliVersion,
    fetchImpl,
    installer,
    now: () => 1_000_000,
  });
  const harness = createBridgeJsonRpcTestHarness(bridge.handleLine);
  return { harness, underlying, readCliVersion, fetchImpl };
}

function sendStatus(harness: ReturnType<typeof createBridgeJsonRpcTestHarness>, id = 1) {
  harness.sendRequest(id, "provider/installation/status", {
    providerId: "kimi-code",
    providerOptions: PROVIDER_OPTIONS,
  });
}

describe("Kimi installation maintenance", () => {
  it("offers an update when the installed CLI is older than the installer channel", async () => {
    const f = fixture({ currentVersion: "2.5.2" });
    try {
      sendStatus(f.harness);
      const response = await f.harness.waitForResponse(1);
      expect(response.error).toBeUndefined();
      expect(response.result).toMatchObject({
        executableName: "kimi",
        executablePath: "/bin/kimi",
        installed: true,
        installSource: "external",
        currentVersion: "2.5.2",
        latestVersion: "2.5.3",
        needsUpdate: true,
        installAction: { kind: "update", label: "Update", command: "install-kimi" },
      });

      sendStatus(f.harness, 2);
      await f.harness.waitForResponse(2);
      expect(f.fetchImpl).toHaveBeenCalledTimes(1);
    } finally {
      f.harness.restore();
    }
  });

  it("offers installation instead of an update when the CLI is missing", async () => {
    const f = fixture({ executablePath: null, currentVersion: null });
    try {
      sendStatus(f.harness);
      const response = await f.harness.waitForResponse(1);
      expect(response.result).toMatchObject({
        installed: false,
        installSource: "notInstalled",
        currentVersion: null,
        latestVersion: "2.5.3",
        needsUpdate: false,
        installAction: { kind: "install", label: "Install", command: "install-kimi" },
      });
      expect(f.readCliVersion).not.toHaveBeenCalled();
    } finally {
      f.harness.restore();
    }
  });

  it("keeps maintenance usable when the latest-version request fails", async () => {
    const f = fixture({
      currentVersion: "2.5.3",
      latestResponse: new Response("unavailable", { status: 503 }),
    });
    try {
      sendStatus(f.harness);
      const response = await f.harness.waitForResponse(1);
      expect(response.error).toBeUndefined();
      expect(response.result).toMatchObject({
        installed: true,
        currentVersion: "2.5.3",
        latestVersion: null,
        needsUpdate: false,
        installAction: null,
      });
    } finally {
      f.harness.restore();
    }
  });

  it("returns the installer and version verification for an available update", async () => {
    const f = fixture({ currentVersion: "2.5.2" });
    try {
      f.harness.sendRequest(1, "provider/installation/run", {
        providerId: "kimi-code",
        action: "update",
        providerOptions: PROVIDER_OPTIONS,
      });
      const response = await f.harness.waitForResponse(1);
      expect(response.error).toBeUndefined();
      expect(response.result).toEqual({
        available: true,
        command: {
          command: "bash",
          args: ["install-kimi"],
          displayCommand: "install-kimi",
        },
        verification: { kind: "version_at_least", version: "2.5.3" },
      });
    } finally {
      f.harness.restore();
    }
  });

  it("declines an update when no newer CLI is available", async () => {
    const f = fixture({ currentVersion: "2.5.3" });
    try {
      f.harness.sendRequest(1, "provider/installation/run", {
        providerId: "kimi-code",
        action: "update",
        providerOptions: PROVIDER_OPTIONS,
      });
      const response = await f.harness.waitForResponse(1);
      expect(response.result).toEqual({
        available: false,
        message: "Kimi Code update is not available on this host.",
      });
    } finally {
      f.harness.restore();
    }
  });
});
