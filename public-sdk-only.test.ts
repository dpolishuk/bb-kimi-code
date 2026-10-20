import { fileURLToPath } from "node:url";

import { experimental_scanPublicSdkOnly as scanPublicSdkOnly } from "@get-bb/plugin-sdk/testing";
import { expect, it } from "vitest";

it("imports only the public SDK, npm packages, and node builtins", () => {
  const scan = scanPublicSdkOnly(
    fileURLToPath(new URL(".", import.meta.url)),
    {
      allow: [
        /^vitest(?:\/|$)/,
        // Deprecated alias of the ACP entrypoint, but the only published
        // build that publishes provider commands and session options (checked
        // against SDK 0.6.49 and 0.6.54). Re-evaluate on SDK upgrades.
        /^@get-bb\/plugin-sdk\/provider-bridge\/acp-next$/,
      ],
    },
  );
  expect(scan.files.length).toBeGreaterThan(0);
  expect(scan.violations).toEqual([]);
  expect(scan.privateDependencies).toEqual([]);
});
