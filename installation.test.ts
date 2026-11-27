import { homedir } from "node:os";
import { join } from "node:path";

import { experimental_createBridgeJsonRpcTestHarness as createBridgeJsonRpcTestHarness } from "@get-bb/plugin-sdk/provider-bridge/testing";
import { describe, expect, it, vi } from "vitest";

import { officialKimiExecutablePath, withKimiInstallation } from "./src/kimi-installation.js";

const PROVIDER_OPTIONS = {
  acpDialect: "kimi",
  acpLaunchSpec: {
    displayName: "Kimi Code",
    command: "kimi",
    args: ["acp"],
    env: {},
  },
};

const OFFICIAL_KIMI = officialKimiExecutablePath();
const HOMEBREW_KIMI = "/opt/homebrew/bin/kimi";

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
    resolveExecutablePath: async () => options.executablePath === undefined ? OFFICIAL_KIMI : options.executablePath,
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
  it("offers an update when the official installer-managed CLI is older than the installer channel", async () => {
    const f = fixture({ currentVersion: "2.5.2" });
    try {
      sendStatus(f.harness);
      const response = await f.harness.waitForResponse(1);
      expect(response.error).toBeUndefined();
      expect(response.result).toMatchObject({
        executableName: "kimi",
        executablePath: OFFICIAL_KIMI,
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

  it("does not offer the official installer when a shadowed Homebrew binary is outdated", async () => {
    const f = fixture({
      executablePath: HOMEBREW_KIMI,
      currentVersion: "2.5.2",
    });
    try {
      sendStatus(f.harness);
      const response = await f.harness.waitForResponse(1);
      expect(response.error).toBeUndefined();
      expect(response.result).toMatchObject({
        executableName: "kimi",
        executablePath: HOMEBREW_KIMI,
        installed: true,
        installSource: "external",
        currentVersion: "2.5.2",
        latestVersion: "2.5.3",
        needsUpdate: false,
        installAction: null,
      });
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

  it("declines an update when the resolved executable is not managed by this installer", async () => {
    const f = fixture({
      executablePath: HOMEBREW_KIMI,
      currentVersion: "2.5.2",
    });
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

  it("rejects a status request with missing providerId and a malformed launch spec as INVALID_PARAMS", async () => {
    const f = fixture({ currentVersion: "2.5.2" });
    try {
      f.harness.sendRequest(1, "provider/installation/status", {
        providerOptions: {
          acpDialect: "kimi",
          acpLaunchSpec: {
            ...PROVIDER_OPTIONS.acpLaunchSpec,
            args: 42,
          },
        },
      });
      const response = await f.harness.waitForResponse(1);
      expect(response.result).toBeUndefined();
      expect(response.error).toMatchObject({
        code: -32602,
      });
      expect(String(response.error?.message)).toMatch(/Invalid params for "provider\/installation\/status"/);
      expect(f.underlying.handleLine).not.toHaveBeenCalled();
      expect(f.fetchImpl).not.toHaveBeenCalled();
    } finally {
      f.harness.restore();
    }
  });

  it("rejects a malformed run request as INVALID_PARAMS instead of returning the installer", async () => {
    const f = fixture({ currentVersion: "2.5.2" });
    try {
      f.harness.sendRequest(1, "provider/installation/run", {
        action: "update",
        providerOptions: {
          acpDialect: "kimi",
          acpLaunchSpec: {
            ...PROVIDER_OPTIONS.acpLaunchSpec,
            args: 42,
          },
        },
      });
      const response = await f.harness.waitForResponse(1);
      expect(response.result).toBeUndefined();
      expect(response.error).toMatchObject({
        code: -32602,
      });
      expect(String(response.error?.message)).toMatch(/Invalid params for "provider\/installation\/run"/);
      expect(f.underlying.handleLine).not.toHaveBeenCalled();
    } finally {
      f.harness.restore();
    }
  });
});

describe("official Kimi executable path", () => {
  it("points at the official installer bin under the user home", () => {
    expect(officialKimiExecutablePath("/Users/demo")).toBe(
      join("/Users/demo", ".kimi-code", "bin", "kimi"),
    );
    expect(OFFICIAL_KIMI).toBe(join(homedir(), ".kimi-code", "bin", "kimi"));
  });
});
