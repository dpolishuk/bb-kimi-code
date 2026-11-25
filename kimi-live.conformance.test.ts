import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  experimental_captureBridgeJsonRpcOutput as captureBridgeJsonRpcOutput,
  experimental_formatConformanceReport as formatConformanceReport,
  experimental_runBridgeConformance as runBridgeConformance,
} from "@get-bb/plugin-sdk/provider-bridge/testing";
import { afterEach, beforeEach, expect, it } from "vitest";

// Live integration test: drives the real ACP bridge against a real `kimi acp`
// child, which needs the kimi binary on PATH and a valid login. It also spends
// model tokens, so it runs only when BB_KIMI_LIVE=1 is set explicitly.
const LIVE = process.env.BB_KIMI_LIVE === "1";

let workspaceDir: string;

beforeEach(() => {
  workspaceDir = mkdtempSync(join(tmpdir(), "bb-kimi-conformance-"));
});

afterEach(() => {
  rmSync(workspaceDir, { recursive: true, force: true });
});

const itLive = LIVE ? it : it.skip;

itLive("passes the canonical protocol suite against a real kimi acp", async () => {
  const { experimental_providerBridge: bridge } =
    process.env.BB_KIMI_HOST_ENTRY === "./dist/host.js"
      // @ts-expect-error The built bundle does not ship type declarations.
      ? await import("./dist/host.js")
      : await import("./host.js");
  const output = captureBridgeJsonRpcOutput();
  try {
    const report = await runBridgeConformance({
      transport: { send: bridge.handleLine, takeMessages: output.takeMessages },
      providerId: "kimi-code",
      session: {
        cwd: workspaceDir,
        promptInput: [
          { type: "text", text: "Reply with exactly: ok", mentions: [] },
        ],
        options: {
          permissionMode: "full",
          permissionScope: "full",
          approvalReviewer: null,
          permissionEscalation: null,
          providerOptions: {
            acpLaunchSpec: {
              displayName: "Kimi Code",
              command: "kimi",
              args: ["acp"],
              env: {},
            },
          },
        },
      },
      timeoutMs: 120_000,
    });

    console.info(`kimi bridge live conformance:\n${formatConformanceReport(report)}`);

    // A live source forks on its own ACP connection, closes the fresh target
    // there, and resumes it in the target process. The lock stays enabled.
    expect(report.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "session/fork-identity", status: "pass" }),
        expect.objectContaining({ id: "session/fork-identity-announced", status: "pass" }),
      ]),
    );
    expect(report.results.map((result) => result.status)).toEqual(
      report.results.map(() => "pass"),
    );
  } finally {
    output.restore();
  }
}, 300_000);
