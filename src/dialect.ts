import { experimental_downloadedInstallerCommand as downloadedInstallerCommand } from "@get-bb/plugin-sdk/provider-bridge";
import type { AcpClassifiedToolCall, AcpDialect, AcpToolCallUpdateEvent } from "@get-bb/plugin-sdk/provider-bridge/acp-next";

import { readKimiAccountFromDisk } from "./kimi-account.js";
import { createKimiCommandNormalizer } from "./kimi-command-echo.js";
import { readKimiUsage } from "./kimi-usage.js";

// kimi emits its Agent and AgentSwarm tools over ACP as kind "other" with the
// tool name in the title: "Agent" / "AgentSwarm" at open, then "Launching
// <type> agent: <description>" / "Launching agent swarm: <description>" on the
// in_progress update whose rawInput carries { prompt, description } /
// { description, prompt_template, items } (live recordings 2026-10-23/24,
// kimi-live.delegation.test.ts and kimi-live.swarm.test.ts). kimi sends no
// _meta tool identity, so the title is the only identity signal.
const KIMI_AGENT_OPEN_TITLE = "Agent";
const KIMI_SWARM_OPEN_TITLE = "AgentSwarm";
const KIMI_AGENT_LAUNCH_TITLE = /^Launching (\w+) agent: (.+)$/;
const KIMI_SWARM_LAUNCH_TITLE = /^Launching agent swarm: (.+)$/;

function readRawInputField(rawInput: unknown, field: string): unknown {
  if (typeof rawInput !== "object" || rawInput === null) {
    return undefined;
  }
  return (rawInput as Record<string, unknown>)[field];
}

function readAgentDescription(rawInput: unknown): string | undefined {
  const description = readRawInputField(rawInput, "description");
  return typeof description === "string" && description.trim() !== ""
    ? description
    : undefined;
}

function readSwarmDetail(rawInput: unknown): string | undefined {
  const items = readRawInputField(rawInput, "items");
  if (!Array.isArray(items)) {
    return undefined;
  }
  return `${items.length} ${items.length === 1 ? "task" : "tasks"}`;
}

function classifyKimiAgentToolCall(
  event: AcpToolCallUpdateEvent,
): AcpClassifiedToolCall | undefined {
  const title = event.title;
  if (title === undefined) {
    return undefined;
  }
  const agentLaunch = KIMI_AGENT_LAUNCH_TITLE.exec(title);
  const swarmLaunch = KIMI_SWARM_LAUNCH_TITLE.exec(title);
  const isAgent = title === KIMI_AGENT_OPEN_TITLE || agentLaunch !== null;
  const isSwarm = title === KIMI_SWARM_OPEN_TITLE || swarmLaunch !== null;
  if (!isAgent && !isSwarm) {
    return undefined;
  }
  const label =
    readAgentDescription(event.rawInput) ??
    agentLaunch?.[2] ??
    swarmLaunch?.[1] ??
    title;
  const detail = isSwarm
    ? readSwarmDetail(event.rawInput)
    : agentLaunch?.[1];
  if (isSwarm) {
    const items = readRawInputField(event.rawInput, "items");
    const labels = Array.isArray(items) ? items.map(String) : [];
    const taskStatus =
      event.status === "failed"
        ? "failed"
        : event.status === "completed"
          ? "completed"
          : "running";
    const agentState =
      event.status === "failed"
        ? "failed"
        : event.status === "completed"
          ? "done"
          : "queued";
    return {
      item: {
        type: "backgroundTask",
        familyId: `agent-swarm-${event.toolCallId}`,
        taskType: "agent_swarm",
        description: label,
        status: taskStatus === "running" ? "pending" : taskStatus,
        taskStatus,
        skipTranscript: false,
        workflow: {
          phases: [{ index: 0, title: "Swarm" }],
          agents: labels.map((itemLabel, index) => ({
            index,
            label: itemLabel,
            state: agentState,
            attempt: 0,
            cached: false,
            lastProgressAt: Date.now(),
            model: "kimi",
          })),
        },
      },
      presentation: {
        label: { pending: "Running subagent", completed: "Subagent finished" },
        icon: { glyph: "UserRound" },
        title: label,
        ...(detail === undefined ? {} : { detail }),
      },
    };
  }
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
      ...(detail === undefined ? {} : { detail }),
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
  normalizeCommandEvent: createKimiCommandNormalizer(),
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
      return readKimiUsage();
    },
  },
};
