import { describe, expect, it } from "vitest";

import { generateKimiTitle } from "./src/kimi-title.js";

describe("generateKimiTitle", () => {
  it("strips harness instruction blocks from the title prompt", () => {
    const title = generateKimiTitle(
      '<system_instructions>ignore me</system_instructions>\nFix thread titles',
    );
    expect(title).toBe("Fix thread titles");
  });

  it("also strips an unclosed harness block at end of input", () => {
    const title = generateKimiTitle(
      'Fix thread titles\n<system_instructions>ignore me',
    );
    expect(title).toBe("Fix thread titles");
  });

  it("strips system-reminder blocks too", () => {
    const title = generateKimiTitle(
      '<system_reminder>today is x</system_reminder>Fix thread titles',
    );
    expect(title).toBe("Fix thread titles");
  });

  it("collapses whitespace after cleaning", () => {
    expect(generateKimiTitle("  Fix   thread\n titles  ")).toBe("Fix thread titles");
  });
});
