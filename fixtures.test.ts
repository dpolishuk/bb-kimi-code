import { readFileSync } from "node:fs";

import { experimental_assembleCapturedThreadEvents as assembleCapturedThreadEvents } from "@get-bb/plugin-sdk/provider-bridge/testing";
import { describe, expect, it } from "vitest";

// Committed replay fixture: the bridge's outbound notifications from a real
// `kimi acp` 2.3.0 turn that called the Agent tool (recorded by
// kimi-live.delegation.test.ts with BB_KIMI_FIXTURE_RECORD; workspace path and
// session id redacted). Replaying it through the real delta assembler pins
// the delegation classification against SDK assembler drift.
const fixture = readFileSync("recordings/agent-delegation.ndjson", "utf8")
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line));

describe("the recorded agent-delegation session", () => {
  const events = assembleCapturedThreadEvents(fixture, "kimi-code");

  it("assembles the fixture into timeline events", () => {
    expect(events.length).toBeGreaterThan(0);
  });

  it("produces a delegation row for kimi's Agent tool call", () => {
    const started = events.find(
      (event) =>
        event.type === "item/started" &&
        (event as { item?: { type?: string } }).item?.type === "delegation",
    ) as { item: { childRef: string; background: boolean } } | undefined;
    expect(started).toBeDefined();
    expect(started?.item.childRef).toMatch(/^0:tool_/);
    expect(started?.item.background).toBe(false);

    const completed = events.find(
      (event) =>
        event.type === "item/completed" &&
        (event as { item?: { type?: string } }).item?.type === "delegation",
    ) as { item: { label: string } } | undefined;
    expect(completed).toBeDefined();
    expect(completed?.item.label).toBe("Compute simple arithmetic");
  });
});
