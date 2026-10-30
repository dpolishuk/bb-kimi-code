# Architecture overview

bb-kimi-code is a **bb provider plugin**: it teaches [bb](https://github.com/get-bb/bb)
to run threads on [Kimi Code CLI](https://github.com/MoonshotAI/kimi-code).
The plugin is deliberately thin — almost all protocol work is done by bb's
published ACP bridge kit.

## Big picture

```
┌─────────────┐   thread/turn commands    ┌──────────────────────────────┐
│  bb app UI  │ ────────────────────────► │           bb server          │
│  / bb CLI   │ ◄──────────────────────── │  (plugin registry, timeline, │
└─────────────┘   ThreadEvents (realtime) │   settings, persistence)     │
                                          └──────────────┬───────────────┘
                                                         │ bridge launch spec
                                                         │ {pluginId, digest}
                                                         ▼
                                          ┌──────────────────────────────┐
                                          │  host daemon (any enrolled   │
                                          │  machine, local or remote)   │
                                          │  • downloads dist/host.js    │
                                          │  • verifies digest           │
                                          │  • runs it with its own node │
                                          └──────────────┬───────────────┘
                                                         │ stdio, line-delimited
                                                         │ JSON-RPC 2.0
                                                         ▼
                                          ┌──────────────────────────────┐
                                          │  provider bridge (plugin's   │
                                          │  bb.host artifact)           │
                                          └──────────────┬───────────────┘
                                                         │ ACP over stdio
                                                         ▼
                                                   ┌───────────┐    ┌────────────┐
                                                   │  kimi acp │ ─► │ Kimi models│
                                                   └───────────┘    └────────────┘
```

## Plugin contents

| File | Runs on | Role |
|---|---|---|
| `package.json` | — | Manifest (`bb` block): identity, icon, entry points, skills |
| `server.ts` | bb server | `bb.providers.register(...)`: provider id, capabilities, strings, model catalog scope, native skill roots, `experimental_bridgeOptions` with the `acpLaunchSpec` (`kimi acp`) and `acpDialect: "kimi"` |
| `host.ts` | host daemon | Exports the ACP bridge with narrow adapters for the fork handshake and `/plan` prompt mapping; registers the `kimi` dialect at module load |
| `src/dialect.ts` | host daemon | Kimi-specific maintenance facts: login command, install script plan, account/usage readers |
| `src/kimi-account.ts` | host daemon | Sign-in detection: OAuth credential file or a provider `api_key` in `config.toml` |
| `icons/kimi.svg` | bb server | Provider mark, served hashed and tinted `currentColor` |
| `skills/kimi-code/SKILL.md` | agent threads | Operating constraints injected into threads as plugin skills |

## Why ACP instead of a custom bridge

Kimi Code ships an ACP server (`kimi acp`), and bb publishes a full bridge for
ACP agents. The plugin uses the `provider-bridge/acp-next` build, which —
unlike the plainer `/acp` entrypoint in SDK 0.6.x — additionally publishes:

- `bb/provider-commands` — Kimi Code's slash commands (`/compact`, `/status`,
  `/usage`, skill commands) into bb's composer menu;
- `bb/session-options` — the `mode` selector (Default / Plan / Auto / YOLO)
  into the composer footer.

Models and thinking levels are not hardcoded: the bridge reads them from the
`configOptions` of ACP `session/new` (`category: "model"` and
`category: "thought_level"` respectively), so new Kimi Code models appear in
bb without a plugin update.

The trade-off and evidence are recorded in
[knowledge/decisions/acp-over-custom-bridge.md](../knowledge/decisions/acp-over-custom-bridge.md).

## Request flow (one turn)

1. The user sends a prompt. The bb server resolves the provider declaration
   for `kimi-code` and issues `thread/start` / `turn/start` commands carrying
   the bridge launch spec and the execution options (model, reasoning level,
   permission policy, session options).
2. The target host's daemon downloads `dist/host.js` (digest-verified, cached)
   and starts one bridge process.
3. The bridge spawns `kimi acp` and translates: `turn/start` → ACP
   `session/prompt`; ACP `session/update` notifications (text chunks, tool
   calls, plans, usage) → `thread/delta` semantic deltas.
4. bb's delta assembler (runtime-side, not the bridge) mints all timeline ids
   and builds the canonical `ThreadEvent`s the UI renders.
5. Approvals flow back: Kimi Code's `session/request_permission` (including
   AskUserQuestion) becomes a bb interaction request, answered by the runtime
   according to the active bb permission mode.

## Remote hosts

There is no remote-specific code in the plugin. bb's host daemon model is the
whole story: any machine enrolled to the bb server runs the same
digest-verified `host.js` artifact, so `kimi acp` is spawned there. The host
needs the `kimi` CLI installed (bb can install it from the provider card) and
signed in (`kimi login`).

## Trust and distribution

- A bridge runs only for an installed, enabled plugin, and only on hosts the
  server instructs.
- The daemon executes artifacts only after digest verification.
- The plugin compiles against the public `@get-bb/plugin-sdk` only — no bb
  workspace packages (enforced by `public-sdk-only.test.ts`).

## Testing layers

| Layer | Files | Runs |
|---|---|---|
| Unit / contract | `server.test.ts`, `dialect.test.ts`, `host.test.ts`, `public-sdk-only.test.ts` | always (`npm test`) |
| Live: protocol conformance | `kimi-live.conformance.test.ts` (16 canonical checks) | `BB_KIMI_LIVE=1` |
| Live: session state | `kimi-live.session-state.test.ts` (commands + mode options) | `BB_KIMI_LIVE=1` |
| Live: maintenance | `kimi-live.maintenance.test.ts` (health, install plan, usage) | `BB_KIMI_LIVE=1` |
| Live: tool pipeline | `kimi-live.tools.test.ts` (real file-writing turn) | `BB_KIMI_LIVE=1` |
