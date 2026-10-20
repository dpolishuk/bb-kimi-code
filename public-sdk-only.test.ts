import { fileURLToPath } from "node:url";

import { experimental_scanPublicSdkOnly as scanPublicSdkOnly } from "@get-bb/plugin-sdk/testing";
import { expect, it } from "vitest";

it("imports only the public SDK, npm packages, and node builtins", () => {
  const scan = scanPublicSdkOnly(
    fileURLToPath(new URL(".", import.meta.url)),
    { allow: [/^vitest(?:\/|$)/] },
  );
  expect(scan.files.length).toBeGreaterThan(0);
  expect(scan.violations).toEqual([]);
  expect(scan.privateDependencies).toEqual([]);
});
