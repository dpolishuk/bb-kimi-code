import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { experimental_acpLaunchSpecSchema as acpLaunchSpecSchema } from "@get-bb/plugin-sdk/provider-bridge/acp";
import { describe, expect, it } from "vitest";

import kimiPlugin, { KIMI_PROVIDER_ID } from "./server.js";

function registeredDeclaration() {
  const host = createFakePluginHost({ pluginId: "kimi-code" });
  kimiPlugin(host.bb);
  const declaration = host.harness.registrations.providerRegistrations.find(
    (entry) => entry.id === KIMI_PROVIDER_ID,
  );
  if (declaration === undefined) {
    throw new Error(`provider "${KIMI_PROVIDER_ID}" was not registered`);
  }
  return declaration;
}

describe("the kimi-code provider declaration", () => {
  it("registers the provider id and display name", () => {
    const declaration = registeredDeclaration();
    expect(declaration.id).toBe("kimi-code");
    expect(declaration.displayName).toBe("Kimi Code");
  });

  it("declares the capabilities kimi acp advertises", () => {
    expect(registeredDeclaration().capabilities).toEqual({
      supportsServiceTier: false,
      supportsNativeUserQuestion: false,
      fork: "tip",
      supportsManualCompaction: true,
      supportsThreadArchive: false,
      supportsThreadRename: false,
      permissionModes: ["accept-edits", "auto", "full"],
      reasoningLevels: ["low", "high", "max"],
    });
  });

  it("labels the reasoning ladder the way kimi names its thinking levels", () => {
    expect(registeredDeclaration().reasoningLevels).toEqual([
      { id: "low", label: "Thinking Low" },
      { id: "high", label: "Thinking High" },
      { id: "max", label: "Thinking Max" },
    ]);
  });

  it("turns on health maintenance only", () => {
    expect(registeredDeclaration().maintenance).toEqual({
      health: true,
      usage: false,
      installation: false,
    });
  });

  it("points sign-in hints at `kimi login`", () => {
    const strings = registeredDeclaration().strings;
    expect(strings?.signInHint).toContain("kimi login");
    expect(strings?.expiredHint).toContain("kimi login");
  });

  it("serves a host-scoped model catalog with an empty cold-cache fallback", () => {
    expect(registeredDeclaration().models).toEqual({
      fallback: [],
      scope: "host",
    });
  });

  it("declares no composer actions the generic ACP bridge would not honor", () => {
    expect(registeredDeclaration().composerActions).toEqual([]);
  });
});

describe("the kimi-code bridge options", () => {
  it("launches `kimi acp` through a spec the published schema accepts", () => {
    const options = registeredDeclaration().experimental_bridgeOptions as {
      acpLaunchSpec?: unknown;
      acpDialect?: unknown;
    };
    expect(options.acpDialect).toBeUndefined();
    expect(acpLaunchSpecSchema.parse(options.acpLaunchSpec)).toEqual({
      displayName: "Kimi Code",
      command: "kimi",
      args: ["acp"],
      env: {},
    });
  });
});

describe("the kimi-code native skill roots", () => {
  it("declares the kimi user and project skill directories", () => {
    expect(registeredDeclaration().experimental_nativeSkillRoots).toEqual({
      user: [
        {
          path: ".kimi-code/skills",
          recursive: false,
          ancestors: false,
          namePrefix: "",
        },
        {
          path: ".agents/skills",
          recursive: false,
          ancestors: false,
          namePrefix: "",
        },
      ],
      project: [
        {
          path: ".kimi-code/skills",
          recursive: false,
          ancestors: true,
          namePrefix: "",
        },
        {
          path: ".agents/skills",
          recursive: false,
          ancestors: true,
          namePrefix: "",
        },
      ],
    });
  });
});
