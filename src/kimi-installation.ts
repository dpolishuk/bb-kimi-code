import {
  experimental_compareVersions as compareVersions,
  experimental_installationVerification as installationVerification,
  experimental_readCliVersion as readCliVersion,
  experimental_resolveExecutablePath as resolveExecutablePath,
  experimental_versionFrom as versionFrom,
  type ProviderInstallationCommand,
  type ProviderInstallationRunResult,
  type ProviderInstallationStatus,
} from "@get-bb/plugin-sdk/provider-bridge";

import { kimiAcpDialect } from "./dialect.js";

const LATEST_VERSION_URL = "https://code.kimi.com/kimi-code/latest";
const DEFAULT_CACHE_MS = 300_000;

type BridgeLike = {
  handleLine: (line: string) => void;
};

export interface KimiInstallationOptions {
  resolveExecutablePath?: typeof resolveExecutablePath;
  readCliVersion?: typeof readCliVersion;
  fetchImpl?: typeof fetch;
  installer?: () => ProviderInstallationCommand;
  now?: () => number;
  cacheMs?: number;
}

interface InstallationRequest {
  id: string | number;
  method: "provider/installation/status" | "provider/installation/run";
  command: string;
  action?: "install" | "update";
}

function defaultInstaller(): ProviderInstallationCommand {
  const maintenance = kimiAcpDialect.maintenance;
  if (maintenance === undefined) {
    throw new Error("Kimi installer is not configured.");
  }
  return maintenance.installer();
}

function installationRequest(line: string): InstallationRequest | undefined {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (typeof value !== "object" || value === null) return undefined;
  const request = value as {
    jsonrpc?: unknown;
    id?: unknown;
    method?: unknown;
    params?: {
      action?: unknown;
      providerOptions?: { acpLaunchSpec?: { command?: unknown } };
    };
  };
  if (
    request.jsonrpc !== "2.0" ||
    (typeof request.id !== "string" && typeof request.id !== "number") ||
    (request.method !== "provider/installation/status" &&
      request.method !== "provider/installation/run")
  ) {
    return undefined;
  }
  const command = request.params?.providerOptions?.acpLaunchSpec?.command;
  if (typeof command !== "string" || command.length === 0) return undefined;
  if (request.method === "provider/installation/status") {
    return { id: request.id, method: request.method, command };
  }
  if (request.params?.action !== "install" && request.params?.action !== "update") {
    return undefined;
  }
  return {
    id: request.id,
    method: request.method,
    command,
    action: request.params.action,
  };
}

export function withKimiInstallation<B extends BridgeLike>(
  bridge: B,
  options: KimiInstallationOptions = {},
): B {
  const resolveExecutable = options.resolveExecutablePath ?? resolveExecutablePath;
  const readVersion = options.readCliVersion ?? readCliVersion;
  const fetchImpl = options.fetchImpl ?? fetch;
  const installer = options.installer ?? defaultInstaller;
  const now = options.now ?? Date.now;
  const cacheMs = options.cacheMs ?? DEFAULT_CACHE_MS;
  let latestCache: { at: number; promise: Promise<string | null> } | undefined;

  const latestVersion = (): Promise<string | null> => {
    const at = now();
    if (latestCache !== undefined && at - latestCache.at < cacheMs) {
      return latestCache.promise;
    }
    const promise = (async () => {
      try {
        const response = await fetchImpl(LATEST_VERSION_URL, {
          signal: AbortSignal.timeout(5_000),
        });
        if (!response.ok) return null;
        return versionFrom((await response.text()).trim());
      } catch {
        return null;
      }
    })();
    latestCache = { at, promise };
    return promise;
  };

  const status = async (command: string): Promise<ProviderInstallationStatus> => {
    const [executablePath, latest] = await Promise.all([
      resolveExecutable(command),
      latestVersion(),
    ]);
    const installed = executablePath !== null;
    const currentVersion = installed ? await readVersion(command) : null;
    const needsUpdate =
      installed &&
      currentVersion !== null &&
      latest !== null &&
      compareVersions(currentVersion, latest) < 0;
    const installAction = !installed
      ? { kind: "install" as const, label: "Install" as const, command: installer().displayCommand }
      : needsUpdate
        ? { kind: "update" as const, label: "Update" as const, command: installer().displayCommand }
        : null;
    return {
      executableName: command,
      executablePath,
      installed,
      installSource: installed ? "external" : "notInstalled",
      currentVersion,
      latestVersion: latest,
      minimumSupportedVersion: null,
      npmPackageName: null,
      npmGlobalPackageVersion: null,
      installAction,
      needsUpdate,
      versionUnsupported: false,
    };
  };

  const run = async (
    command: string,
    action: "install" | "update",
  ): Promise<ProviderInstallationRunResult> => {
    const current = await status(command);
    if (current.installAction?.kind !== action) {
      return {
        available: false,
        message: `Kimi Code ${action} is not available on this host.`,
      };
    }
    return {
      available: true,
      command: installer(),
      verification: installationVerification(current, action),
    };
  };

  return {
    ...bridge,
    handleLine(line: string) {
      const request = installationRequest(line);
      if (request === undefined) {
        bridge.handleLine(line);
        return;
      }
      const work = request.method === "provider/installation/status"
        ? status(request.command)
        : run(request.command, request.action!);
      void work.then(
        (result) => writeJson({ jsonrpc: "2.0", id: request.id, result }),
        (error: unknown) => writeJson({
          jsonrpc: "2.0",
          id: request.id,
          error: {
            code: -32000,
            message: error instanceof Error ? error.message : String(error),
          },
        }),
      );
    },
  } as B;
}

function writeJson(message: unknown): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}
