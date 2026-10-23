// The SDK's ACP bridge answers `initialize` with a hardcoded
// `fork: "tip"` capability without consulting the agent. kimi >= 2.3.0 locks
// each session to its owning process, so bb's cross-process fork of a live
// session always fails (knowledge/incidents/2026-10-22-kimi-23-session-lock-breaks-fork.md)
// and the provider declaration says `fork: "none"`. Handshake capability facts
// may only narrow the declaration, so until the SDK stops hardcoding the claim
// we rewrite `fork` in the initialize response at the plugin boundary.

const SDK_FORK_CLAIM = "tip";
const DECLARED_FORK = "none";

type BridgeLike = {
  handleLine: (line: string) => void;
};

export function narrowInitializeForkOnBridge<B extends BridgeLike>(bridge: B): B {
  return {
    ...bridge,
    handleLine(line: string) {
      const requestId = initializeRequestId(line);
      if (requestId === undefined) {
        bridge.handleLine(line);
        return;
      }
      // The SDK answers initialize synchronously inside handleLine, so the
      // stdout patch lives exactly for that call and is restored right after.
      const passthroughWrite = process.stdout.write;
      const restore = () => {
        process.stdout.write = passthroughWrite;
      };
      process.stdout.write = ((chunk: Uint8Array | string, encoding?: BufferEncoding, callback?: (error?: Error | null) => void) => {
        const rewritten =
          typeof chunk === "string" ? rewriteForkClaim(chunk, requestId) : null;
        if (rewritten !== null) {
          restore();
          chunk = rewritten;
        }
        return passthroughWrite.call(process.stdout, chunk, encoding as BufferEncoding, callback);
      }) as typeof process.stdout.write;
      try {
        bridge.handleLine(line);
      } finally {
        restore();
      }
    },
  } as B;
}

function initializeRequestId(line: string): unknown | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    (parsed as { jsonrpc?: unknown }).jsonrpc === "2.0" &&
    (parsed as { method?: unknown }).method === "initialize" &&
    "id" in parsed
  ) {
    return (parsed as { id: unknown }).id;
  }
  return undefined;
}

function rewriteForkClaim(chunk: string, requestId: unknown): string | null {
  let message: unknown;
  try {
    message = JSON.parse(chunk);
  } catch {
    return null;
  }
  if (
    typeof message !== "object" ||
    message === null ||
    (message as { jsonrpc?: unknown }).jsonrpc !== "2.0" ||
    (message as { id?: unknown }).id !== requestId ||
    !(("result" in message) as boolean)
  ) {
    return null;
  }
  const { result } = message as { result: { capabilities?: { fork?: unknown } } };
  if (result?.capabilities?.fork !== SDK_FORK_CLAIM) {
    return null;
  }
  const narrowed = {
    ...message,
    result: {
      ...result,
      capabilities: { ...result.capabilities, fork: DECLARED_FORK },
    },
  };
  return chunk.endsWith("\n") ? `${JSON.stringify(narrowed)}\n` : JSON.stringify(narrowed);
}
