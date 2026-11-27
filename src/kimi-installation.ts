import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import {
  BRIDGE_JSON_RPC_ERRORS,
  bridgeRequestEnvelopeSchema,
  experimental_compareVersions as compareVersions,
  experimental_installationVerification as installationVerification,
  experimental_readCliVersion as readCliVersion,
  experimental_resolveExecutablePath as resolveExecutablePath,
  experimental_versionFrom as versionFrom,
  hostDaemonAcpLaunchSpecSchema,
  providerInstallationRunParamsSchema,
  providerInstallationStatusParamsSchema,
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

type ParsedInstallationRequest =
  | { kind: "passthrough" }
  | { kind: "invalid"; id: string | number; method: string; issues: string }
  | { kind: "status"; id: string | number; command: string }
  | { kind: "run"; id: string | number; command: string; action: "install" | "update" };

function defaultInstaller(): ProviderInstallationCommand {
  const maintenance = kimiAcpDialect.maintenance;
  if (maintenance === undefined) {
    throw new Error("Kimi installer is not configured.");
  }
  return maintenance.installer();
}

export function officialKimiExecutablePath(home = homedir()): string {
  const name = process.platform === "win32" ? "kimi.exe" : "kimi";
  return join(home, ".kimi-code", "bin", name);
}

async function resolveExistingPath(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return resolve(path);
  }
}

async function isInstallerManagedExecutable(executablePath: string): Promise<boolean> {
  const [resolved, official] = await Promise.all([
    resolveExistingPath(executablePath),
    resolveExistingPath(officialKimiExecutablePath()),
  ]);
  return resolved === official;
}

function launchSpecCommand(providerOptions: Record<string, unknown> | undefined): string | undefined {
  const parsed = hostDaemonAcpLaunchSpecSchema.safeParse(providerOptions?.["acpLaunchSpec"]);
  if (!parsed.success) return undefined;
  return parsed.data.command;
}

function formatZodIssues(issues: { path: PropertyKey[]; message: string }[]): string {
  return issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
}

function invalidLaunchSpecRequest(
  id: string | number,
  method: string,
  providerOptions: Record<string, unknown> | undefined,
): Extract<ParsedInstallationRequest, { kind: "invalid" }> | undefined {
  const launchSpecValue = providerOptions?.["acpLaunchSpec"];
  if (launchSpecValue === undefined) return undefined;
  const launchSpec = hostDaemonAcpLaunchSpecSchema.safeParse(launchSpecValue);
  if (launchSpec.success) return undefined;
  return {
    kind: "invalid",
    id,
    method,
    issues: formatZodIssues(
      launchSpec.error.issues.map((issue) => ({
        path: ["providerOptions", "acpLaunchSpec", ...issue.path],
        message: issue.message,
      })),
    ),
  };
}

function parseInstallationRequest(line: string): ParsedInstallationRequest {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return { kind: "passthrough" };
  }
  const envelope = bridgeRequestEnvelopeSchema.safeParse(value);
  if (!envelope.success) return { kind: "passthrough" };
  const method = envelope.data.method;
  if (method !== "provider/installation/status" && method !== "provider/installation/run") {
    return { kind: "passthrough" };
  }

  if (method === "provider/installation/status") {
    const params = providerInstallationStatusParamsSchema.safeParse(envelope.data.params ?? {});
    if (!params.success) {
      return {
        kind: "invalid",
        id: envelope.data.id,
        method,
        issues: formatZodIssues(params.error.issues),
      };
    }
    const invalidLaunchSpec = invalidLaunchSpecRequest(envelope.data.id, method, params.data.providerOptions);
    if (invalidLaunchSpec !== undefined) return invalidLaunchSpec;
    const command = launchSpecCommand(params.data.providerOptions);
    if (command === undefined || command.length === 0) {
      return { kind: "passthrough" };
    }
    return { kind: "status", id: envelope.data.id, command };
  }

  const params = providerInstallationRunParamsSchema.safeParse(envelope.data.params ?? {});
  if (!params.success) {
    return {
      kind: "invalid",
      id: envelope.data.id,
      method,
      issues: formatZodIssues(params.error.issues),
    };
  }
  const invalidLaunchSpec = invalidLaunchSpecRequest(envelope.data.id, method, params.data.providerOptions);
  if (invalidLaunchSpec !== undefined) return invalidLaunchSpec;
  const command = launchSpecCommand(params.data.providerOptions);
  if (command === undefined || command.length === 0) {
    return { kind: "passthrough" };
  }
  return {
    kind: "run",
    id: envelope.data.id,
    command,
    action: params.data.action,
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
    const managed = installed && executablePath !== null
      ? await isInstallerManagedExecutable(executablePath)
      : false;
    const needsUpdate =
      managed &&
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
      const request = parseInstallationRequest(line);
      if (request.kind === "passthrough") {
        bridge.handleLine(line);
        return;
      }
      if (request.kind === "invalid") {
        writeJson({
          jsonrpc: "2.0",
          id: request.id,
          error: {
            code: BRIDGE_JSON_RPC_ERRORS.INVALID_PARAMS,
            message: `Invalid params for "${request.method}": ${request.issues}`,
          },
        });
        return;
      }
      const work = request.kind === "status"
        ? status(request.command)
        : run(request.command, request.action);
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
