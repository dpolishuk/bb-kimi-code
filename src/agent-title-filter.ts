import type {
  ProviderBridgeContext,
  ProviderBridgeDefinition,
} from "@get-bb/plugin-sdk/provider-bridge";

const HARNESS_TITLE = /^\s*<system(?:_instructions|[-_]reminder)>/iu;

type StdoutWrite = typeof process.stdout.write;
type WriteCallback = (error?: Error | null) => void;

export function suppressHarnessAgentTitlesOnBridge<B extends ProviderBridgeDefinition>(
  bridge: B,
): B & ProviderBridgeDefinition {
  let passthroughWrite: StdoutWrite | undefined;
  const filteringWrite = ((
    chunk: Uint8Array | string,
    encodingOrCallback?: BufferEncoding | WriteCallback,
    callback?: WriteCallback,
  ) => {
    const filtered = typeof chunk === "string" ? filterHarnessAgentTitles(chunk) : chunk;
    const writeCallback =
      typeof encodingOrCallback === "function" ? encodingOrCallback : callback;
    if (filtered === null) {
      writeCallback?.(null);
      return true;
    }
    if (passthroughWrite === undefined) return false;
    return Reflect.apply(passthroughWrite, process.stdout, [
      filtered,
      ...(encodingOrCallback === undefined ? [] : [encodingOrCallback]),
      ...(callback === undefined ? [] : [callback]),
    ]) as boolean;
  }) as StdoutWrite;

  const install = () => {
    if (passthroughWrite !== undefined) return;
    passthroughWrite = process.stdout.write;
    process.stdout.write = filteringWrite;
  };
  const restore = () => {
    if (process.stdout.write === filteringWrite && passthroughWrite !== undefined) {
      process.stdout.write = passthroughWrite;
    }
    passthroughWrite = undefined;
  };

  return {
    ...bridge,
    start(context: ProviderBridgeContext) {
      install();
      bridge.start?.(context);
    },
    onClose() {
      restore();
      bridge.onClose?.();
    },
    onSigterm() {
      restore();
      bridge.onSigterm?.();
    },
    onSigint() {
      restore();
      bridge.onSigint?.();
    },
  } as B & ProviderBridgeDefinition;
}

function filterHarnessAgentTitles(output: string): string | null {
  let message: unknown;
  try {
    message = JSON.parse(output);
  } catch {
    return output;
  }
  if (!isRecord(message) || message.method !== "thread/delta") return output;
  const params = message.params;
  if (!isRecord(params) || !Array.isArray(params.deltas)) return output;
  const deltas = params.deltas.filter((delta) => !isHarnessAgentTitle(delta));
  if (deltas.length === params.deltas.length) return output;
  if (deltas.length === 0) return null;
  const filtered = { ...message, params: { ...params, deltas } };
  return `${JSON.stringify(filtered)}${output.endsWith("\n") ? "\n" : ""}`;
}

function isHarnessAgentTitle(delta: unknown): boolean {
  return (
    isRecord(delta) &&
    delta.kind === "thread.name" &&
    delta.source === "agent" &&
    typeof delta.name === "string" &&
    HARNESS_TITLE.test(delta.name)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
