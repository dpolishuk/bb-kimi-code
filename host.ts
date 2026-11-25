import { experimental_acpProviderBridge as acpProviderBridge, experimental_registerAcpDialect as registerAcpDialect } from "@get-bb/plugin-sdk/provider-bridge/acp-next";

import { suppressHarnessAgentTitlesOnBridge } from "./src/agent-title-filter.js";
import { kimiAcpDialect } from "./src/dialect.js";
import { mapPlanPromptMode } from "./src/prompt-mode.js";
import { gateQuotaExhaustedTurns } from "./src/quota-gate.js";

registerAcpDialect(kimiAcpDialect);

// `provider-bridge/acp-next` is the fuller ACP bridge in SDK 0.6.x: unlike
// `/acp` it publishes `bb/provider-commands` and `bb/session-options` thread
// state and wires dialect maintenance. It is marked a deprecated alias of
// `/acp` in newer bb docs; if a future SDK merges the entrypoints, switch the
// import back to `/acp` and re-run the live tests.
//
// The quota gate checks turn/start against Kimi's usage windows: kimi's
// acp-server answers a quota-exhausted (429) prompt with a bare end_turn and
// no updates, which bb renders as an inexplicable empty turn. While a window
// is fully spent the gate fails the turn fast with a typed rateLimited
// recovery hint instead. BB_KIMI_QUOTA_GATE=0 disables it (tests, recordings).
//
// The outermost filter drops Kimi's replaceable agent title when it comes
// from BB's harness-instruction prefix. BB then keeps its generated title or
// user-prompt fallback; genuine Kimi-generated titles pass through unchanged.
export const experimental_providerBridge = suppressHarnessAgentTitlesOnBridge(
  gateQuotaExhaustedTurns(
    mapPlanPromptMode(acpProviderBridge),
    { enabled: process.env.BB_KIMI_QUOTA_GATE !== "0" },
  ),
);
