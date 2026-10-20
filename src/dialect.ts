import { experimental_downloadedInstallerCommand as downloadedInstallerCommand } from "@get-bb/plugin-sdk/provider-bridge";
import type { AcpDialect } from "@get-bb/plugin-sdk/provider-bridge/acp-next";

import { readKimiAccountFromDisk } from "./kimi-account.js";

// Kimi Code CLI maintenance facts, verified 2026-10-20 against CLI 2.2.0:
// - install: official script (macOS/Linux) or PowerShell script (Windows);
//   there is no official npm package for the 2.x single-binary CLI.
// - account: OAuth credentials or a configured provider api_key prove
//   sign-in; no email is readable locally (the JWT carries no email claim).
// - usage: kimi exposes no account quota interface (no CLI command, no config
//   field); session token usage stays available in-thread via /usage.
export const kimiAcpDialect: AcpDialect = {
  id: "kimi",
  maintenance: {
    loginCommand: "kimi login",
    installer() {
      return downloadedInstallerCommand(
        "https://code.kimi.com/kimi-code/install.sh",
        { powershellUrl: "https://code.kimi.com/kimi-code/install.ps1" },
      );
    },
    readAccount() {
      return readKimiAccountFromDisk();
    },
    readUsage() {
      return Promise.resolve({ supported: false as const });
    },
  },
};
