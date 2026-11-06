import type { AcpToolCallUpdateEvent } from "@get-bb/plugin-sdk/provider-bridge/acp-next";

// kimi acp streams tool call arguments as cumulative JSON snapshots in the ACP
// content text until an in_progress update carries rawInput with
// content === JSON.stringify(rawInput). Real output only starts afterwards,
// so earlier snapshots are argument echo, not tool output. Command output uses
// per-call phase tracking; generic progress uses the SDK's merged call instead.

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

export function normalizeKimiToolCallEvent(
  event: AcpToolCallUpdateEvent,
  call: AcpToolCallUpdateEvent,
): AcpToolCallUpdateEvent {
  const text = readContentText(event);
  if (text === undefined) {
    return event;
  }
  if (call.rawInput !== undefined) {
    return text === JSON.stringify(call.rawInput) ? withoutContent(event) : event;
  }
  const terminal =
    event.status === "completed" ||
    event.status === "failed" ||
    event.status === "cancelled";
  return terminal ? event : withoutContent(event);
}

export function createKimiCommandNormalizer() {
  const outputStarted = new Set<string>();

  return function normalizeCommandEvent(
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
