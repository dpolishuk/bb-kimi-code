import { experimental_downloadedInstallerCommand as downloadedInstallerCommand } from "@get-bb/plugin-sdk/provider-bridge";
import type { AcpClassifiedToolCall, AcpDialect, AcpToolCallUpdateEvent } from "@get-bb/plugin-sdk/provider-bridge/acp-next";

import { readKimiAccountFromDisk } from "./kimi-account.js";

// kimi emits its Agent tool over ACP as kind "other" with the tool name in the
// title: "Agent" at open, then "Launching <type> agent: <description>" on the
// in_progress update whose rawInput carries { prompt, description } (live
// recording 2026-10-23, kimi-live.delegation.test.ts). kimi sends no _meta
// tool identity, so the title is the only identity signal.
const KIMI_AGENT_OPEN_TITLE = "Agent";
const KIMI_AGENT_LAUNCH_TITLE = /^Launching (\w+) agent: (.+)$/;

function readAgentDescription(rawInput: unknown): string | undefined {
  if (typeof rawInput !== "object" || rawInput === null) {
    return undefined;
  }
  const description = (rawInput as { description?: unknown }).description;
  return typeof description === "string" && description.trim() !== ""
    ? description
    : undefined;
}

function classifyKimiAgentToolCall(
  event: AcpToolCallUpdateEvent,
): AcpClassifiedToolCall | undefined {
  const title = event.title;
  if (title === undefined) {
    return undefined;
  }
  const launch = KIMI_AGENT_LAUNCH_TITLE.exec(title);
  if (title !== KIMI_AGENT_OPEN_TITLE && launch === null) {
    return undefined;
  }
  const label = readAgentDescription(event.rawInput) ?? launch?.[2] ?? title;
  const subagentType = launch?.[1];
  return {
    item: {
      type: "delegation",
      childRef: event.toolCallId,
      label,
      background: false,
    },
    presentation: {
      label: { pending: "Running subagent", completed: "Subagent finished" },
      icon: { glyph: "UserRound" },
      title: label,
      ...(subagentType === undefined ? {} : { detail: subagentType }),
    },
  };
}

// Kimi Code CLI maintenance facts, verified 2026-10-20 against CLI 2.2.0:
// - install: official script (macOS/Linux) or PowerShell script (Windows);
//   there is no official npm package for the 2.x single-binary CLI.
// - account: OAuth credentials or a configured provider api_key prove
//   sign-in; no email is readable locally (the JWT carries no email claim).
// - usage: kimi exposes no account quota interface (no CLI command, no config
//   field); session token usage stays available in-thread via /usage.
export const kimiAcpDialect: AcpDialect = {
  id: "kimi",
  classifyToolCall: classifyKimiAgentToolCall,
  maintenance: {
    loginCommand: "kimi login",
    installer() {
      return downloadedInstallerCommand(
        "https://code.kimi.com/kimi-code/install.sh",
        { powershellUrl: "https://code.kimi.com/kimi-code/install.ps1" },
      );
    },
    readAccount() {
      return readKimiAccountFromDisk();
    },
    readUsage() {
      return Promise.resolve({ supported: false as const });
    },
  },
};
