import type { BbPluginApi } from "@get-bb/plugin-sdk";

export const KIMI_PLUGIN_ID = "kimi-code";
export const KIMI_PROVIDER_ID = "kimi-code";

// Capabilities below mirror what `kimi acp` (Kimi Code CLI 2.2.0) reports in
// its ACP initialize handshake: loadSession, promptCapabilities.image,
// sessionCapabilities { list, resume, close, delete, fork }, and the
// session/new configOptions for model, thinking level, and mode. Re-probe the
// handshake before widening them. One deliberate narrowing: kimi >= 2.3.0
// locks each session to its owning process for the process lifetime, and bb
// forks by asking a NEW kimi process to fork the still-live source session,
// which kimi rejects ("This session is in use by another Kimi Code process").
// Tip-forks only succeed after the owner exits, so fork stays "none" until
// kimi allows cross-process forks of live sessions.
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
    },
    maintenance: { health: true, usage: false, installation: true },
    capabilities: {
      supportsServiceTier: false,
      supportsNativeUserQuestion: false,
      fork: "none",
      supportsManualCompaction: true,
      supportsThreadArchive: false,
      supportsThreadRename: false,
      permissionModes: ["accept-edits", "auto", "full"],
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
    // The generic ACP bridge ignores promptMode, and bb's own ACP plugin
    // declares no composer actions for any agent — plan mode is not wired
    // through ACP, so we do not advertise it.
    composerActions: [],
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
}
