import type { AcpToolCallUpdateEvent } from "@get-bb/plugin-sdk/provider-bridge/acp-next";

// kimi acp streams tool call arguments as cumulative JSON snapshots in the ACP
// content text until an in_progress update carries rawInput with
// content === JSON.stringify(rawInput). Real output only starts afterwards,
// so earlier snapshots are argument echo, not tool output. Phase is tracked
// per toolCallId and cleared on terminal updates. The same normalizer serves
// normalizeCommandEvent (command output) and normalizeToolCallEvent (progress
// text of every other tool, e.g. Agent delegations).

function readContentText(event: AcpToolCallUpdateEvent): string | undefined {
  for (const part of event.content ?? []) {
    if (part.type === "content" && part.content.type === "text" && typeof part.content.text === "string") {
      return part.content.text;
    }
  }
  return undefined;
}

function isArgumentEcho(event: AcpToolCallUpdateEvent, text: string): boolean {
  return event.rawInput !== undefined && text === JSON.stringify(event.rawInput);
}

function withoutContent(event: AcpToolCallUpdateEvent): AcpToolCallUpdateEvent {
  const { content: _content, ...rest } = event;
  return rest;
}

export function createKimiToolCallNormalizer() {
  const outputStarted = new Set<string>();

  return function normalizeToolCallEvent(
    event: AcpToolCallUpdateEvent,
  ): AcpToolCallUpdateEvent {
    const text = readContentText(event);
    const terminal =
      event.status === "completed" ||
      event.status === "failed" ||
      event.status === "cancelled";
    if (terminal) {
      outputStarted.delete(event.toolCallId);
      return text !== undefined && isArgumentEcho(event, text)
        ? withoutContent(event)
        : event;
    }
    if (text === undefined) {
      return event;
    }
    if (outputStarted.has(event.toolCallId)) {
      return event;
    }
    if (event.rawInput !== undefined) {
      outputStarted.add(event.toolCallId);
      return isArgumentEcho(event, text) ? withoutContent(event) : event;
    }
    return withoutContent(event);
  };
}
