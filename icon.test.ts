import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// bb renders provider logo assets as currentColor masks ("Provider logo
// assets use a currentColor mask" — PluginProviderIconRegistration docs in
// @get-bb/plugin-sdk): only the alpha silhouette survives, filled with the
// surrounding text color. A multicolor icon (black tile + white K + blue dot)
// collapses into a solid dark blob in the composer pill, so the branding icon
// must carry the K and the dot as CUTOUTS in a single-paint silhouette.
const svg = readFileSync(new URL("./icons/kimi.svg", import.meta.url), "utf8");

describe("the kimi provider icon", () => {
  it("uses a single paint so bb's currentColor mask keeps the glyph", () => {
    const paints = [...svg.matchAll(/(?:fill|stroke)="([^"]+)"/g)]
      .map((match) => match[1])
      .filter((value) => value !== "none");
    expect(new Set(paints).size).toBeLessThanOrEqual(1);
  });

  it("cuts the K and the dot out of the tile with an evenodd path", () => {
    expect(svg).toContain('fill-rule="evenodd"');
  });
});
