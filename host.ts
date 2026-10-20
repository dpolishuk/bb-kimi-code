import { experimental_registerAcpDialect as registerAcpDialect } from "@get-bb/plugin-sdk/provider-bridge/acp-next";

import { kimiAcpDialect } from "./src/dialect.js";

registerAcpDialect(kimiAcpDialect);

// `provider-bridge/acp-next` is the fuller ACP bridge in SDK 0.6.x: unlike
// `/acp` it publishes `bb/provider-commands` and `bb/session-options` thread
// state and wires dialect maintenance. It is marked a deprecated alias of
// `/acp` in newer bb docs; if a future SDK merges the entrypoints, switch the
// import back to `/acp` and re-run the live tests.
export { experimental_acpProviderBridge as experimental_providerBridge } from "@get-bb/plugin-sdk/provider-bridge/acp-next";
