import type { BbPluginApi } from "@get-bb/plugin-sdk";

import { generateKimiTitle } from "./src/kimi-title.js";
import { readKimiAccountFromDisk } from "./src/kimi-account.js";
import { registerUsageSource } from "./src/usage-source.js";

export const KIMI_PLUGIN_ID = "kimi-code";
export const KIMI_PROVIDER_ID = "kimi-code";

// Capabilities mirror the current `kimi acp` handshake. Live-source forks use
// the SDK handoff: fork and close on the source ACP connection, then resume the
// target in its own process. Historical checkpoint selection is not exposed by
// Kimi ACP, so only tip fork is declared.
export default function plugin(bb: BbPluginApi) {
  bb.providers.register({
    id: KIMI_PROVIDER_ID,
    displayName: "Kimi Code",
    icon: "./icons/kimi.svg",
    strings: {
      signInHint: "Run `kimi login` on the machine to sign in.",
      expiredHint:
        "Your Kimi Code session expired. Run `kimi login`, then reload.",
      installUrl: "https://github.com/MoonshotAI/kimi-code",
      // bb draws provider logos as currentColor masks; tint the silhouette
      // with the kimi tile colors instead of the ambient text color.
      iconTint: { light: "#0A0A0C", dark: "#FFFFFF" },
    },
    maintenance: { health: true, usage: true, installation: true },
    capabilities: {
      supportsServiceTier: false,
      supportsNativeUserQuestion: false,
      fork: "tip",
      supportsManualCompaction: true,
      supportsThreadArchive: false,
      supportsThreadRename: false,
      // The SDK ACP bridge throws on bb's "auto" mode (buildAcpSessionParams /
      // reconcileExecutionSettings): ACP has no equivalent for bb's
      // auto-reviewer, so the bridge enforces only accept-edits (workspace
      // write roots) and full. bb's builtin ACP provider plugins declare the
      // same pair. Declaring "auto" sent threads straight into that throw.
      permissionModes: ["accept-edits", "full"],
      // bb starts new threads at "medium" by default and validates the level
      // against this ladder. kimi only knows low/high/max, so "medium" is
      // declared but maps to nothing kimi-side: the bridge omits it and kimi
      // runs its current thinking level (its default: high).
      reasoningLevels: ["low", "medium", "high", "max"],
    },
    reasoningLevels: [
      { id: "low", label: "Thinking Low" },
      { id: "medium", label: "Medium (Kimi default)" },
      { id: "high", label: "Thinking High" },
      { id: "max", label: "Thinking Max" },
    ],
    // The generic ACP bridge ignores promptMode; map it to the mode selector
    // so bb's /plan composer action actually enters kimi's plan mode.
    composerActions: ["plan"],
    models: { fallback: [], scope: "host" },
    experimental_nativeSkillRoots: {
      user: [".kimi-code/skills", ".agents/skills"],
      project: [
        { path: ".kimi-code/skills", ancestors: true },
        { path: ".agents/skills", ancestors: true },
      ],
    },
    experimental_bridgeOptions: {
      acpDialect: "kimi",
      acpLaunchSpec: {
        displayName: "Kimi Code",
        command: "kimi",
        args: ["acp"],
        env: {},
      },
    },
  });

  registerUsageSource(bb);

  bb.experimental_aiServices.register({
    id: "kimi-code",
    displayName: "Kimi Code (local model)",
    complete: async (prompt, options) => generateKimiTitle(prompt, options),
    async status() {
      const account = await readKimiAccountFromDisk();
      if (account !== null) return { ready: true };
      return {
        ready: false,
        message: "Run `kimi login` on the machine to enable title generation.",
      };
    },
  });
}
