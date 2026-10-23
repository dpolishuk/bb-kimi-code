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

  it("declares the capabilities kimi acp advertises, minus live-broken fork", () => {
    expect(registeredDeclaration().capabilities).toEqual({
      supportsServiceTier: false,
      supportsNativeUserQuestion: false,
      fork: "none",
      supportsManualCompaction: true,
      supportsThreadArchive: false,
      supportsThreadRename: false,
      permissionModes: ["accept-edits", "full"],
      reasoningLevels: ["low", "medium", "high", "max"],
    });
  });

  it("narrows fork to none because kimi locks live sessions to their process", () => {
    // kimi >= 2.3.0 holds an exclusive per-session lock for as long as the
    // owning kimi process lives, and bb forks by asking a NEW kimi process
    // to fork the still-live source session — kimi rejects that with "This
    // session is in use by another Kimi Code process". Tip-forks only work
    // after the owner process exits, which bb's fork flow never guarantees,
    // so the declaration must not offer fork.
    expect(registeredDeclaration().capabilities.fork).toBe("none");
  });

  it("declares only the permission modes the ACP bridge can enforce", () => {
    // The SDK ACP bridge throws on bb's "auto" mode ("Provider ... does not
    // support permission mode \"auto\"" in buildAcpSessionParams, and again
    // in reconcileExecutionSettings): ACP has no equivalent for bb's
    // auto-reviewer, and the bridge enforces only accept-edits (workspace
    // write roots) and full (approve everything) itself. bb's own builtin
    // ACP provider plugins declare the same pair. Declaring "auto" let bb
    // dispatch threads straight into that throw (thread thr_v5fvsnn7m6,
    // 2026-10-23), so the declaration must not offer it.
    expect(registeredDeclaration().capabilities.permissionModes).toEqual([
      "accept-edits",
      "full",
    ]);
  });

  it("declares the reasoning ladder with bb's default medium level", () => {
    // bb starts new threads at "medium" by default and validates the level
    // against this ladder; kimi itself only knows low/high/max, so "medium"
    // falls back to kimi's current thinking level (its default: high).
    expect(registeredDeclaration().capabilities.reasoningLevels).toEqual([
      "low",
      "medium",
      "high",
      "max",
    ]);
  });

  it("labels the reasoning ladder the way kimi names its thinking levels", () => {
    expect(registeredDeclaration().reasoningLevels).toEqual([
      { id: "low", label: "Thinking Low" },
      { id: "medium", label: "Medium (Kimi default)" },
      { id: "high", label: "Thinking High" },
      { id: "max", label: "Thinking Max" },
    ]);
  });

  it("turns on health and installation maintenance", () => {
    expect(registeredDeclaration().maintenance).toEqual({
      health: true,
      usage: false,
      installation: true,
    });
  });

  it("points sign-in hints at `kimi login`", () => {
    const strings = registeredDeclaration().strings;
    expect(strings?.signInHint).toContain("kimi login");
    expect(strings?.expiredHint).toContain("kimi login");
  });

  it("tints the masked provider icon with the kimi tile colors per theme", () => {
    expect(registeredDeclaration().strings?.iconTint).toEqual({
      light: "#0A0A0C",
      dark: "#FFFFFF",
    });
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
    expect(options.acpDialect).toBe("kimi");
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
