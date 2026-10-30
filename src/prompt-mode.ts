type BridgeLike = {
  handleLine: (line: string) => void;
};

type TurnStartLine = {
  params?: {
    providerThreadId?: unknown;
    options?: { promptMode?: unknown; sessionOptions?: Record<string, unknown> };
  };
};

export function mapPlanPromptMode<B extends BridgeLike>(bridge: B): B {
  return {
    ...bridge,
    handleLine(line: string) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        bridge.handleLine(line);
        return;
      }
      if (typeof parsed !== "object" || parsed === null) {
        bridge.handleLine(line);
        return;
      }
      const params = (parsed as TurnStartLine).params;
      if (params?.options?.promptMode === "plan") {
        const options = params.options ?? {};
        params.options = {
          ...options,
          sessionOptions: { ...(options.sessionOptions ?? {}), mode: "plan" },
        };
        bridge.handleLine(JSON.stringify(parsed));
        return;
      }
      bridge.handleLine(line);
    },
  } as B;
}
