import { experimental_acpProviderBridge as acpProviderBridge, experimental_registerAcpDialect as registerAcpDialect } from "@get-bb/plugin-sdk/provider-bridge/acp-next";

import { kimiAcpDialect } from "./src/dialect.js";
import { narrowInitializeForkOnBridge } from "./src/handshake-fork.js";
import { mapPlanPromptMode } from "./src/prompt-mode.js";
import { gateQuotaExhaustedTurns } from "./src/quota-gate.js";

registerAcpDialect(kimiAcpDialect);

// `provider-bridge/acp-next` is the fuller ACP bridge in SDK 0.6.x: unlike
// `/acp` it publishes `bb/provider-commands` and `bb/session-options` thread
// state and wires dialect maintenance. It is marked a deprecated alias of
// `/acp` in newer bb docs; if a future SDK merges the entrypoints, switch the
// import back to `/acp` and re-run the live tests.
//
// The bridge export is wrapped to narrow the initialize handshake to the
// declared capabilities: the SDK hardcodes `fork: "tip"` there, but kimi
// >= 2.3.0 cannot fork live sessions cross-process, so the declaration (and
// with this wrapper the handshake too) says `fork: "none"`.
//
// The outermost wrapper gates turn/start on the Kimi usage windows: kimi's
// acp-server answers a quota-exhausted (429) prompt with a bare end_turn and
// no updates, which bb renders as an inexplicable empty turn. While a window
// is fully spent the gate fails the turn fast with a typed rateLimited
// recovery hint instead. BB_KIMI_QUOTA_GATE=0 disables it (tests, recordings).
export const experimental_providerBridge = gateQuotaExhaustedTurns(
  mapPlanPromptMode(narrowInitializeForkOnBridge(acpProviderBridge)),
  { enabled: process.env.BB_KIMI_QUOTA_GATE !== "0" },
);
