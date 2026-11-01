---
name: kimi-code
description: Operating constraints of the Kimi Code agent provider in bb — install, sign-in, models, thinking levels, and permission modes on local and enrolled hosts.
---

# Kimi Code provider

Threads on the `kimi-code` provider run the locally installed Kimi Code CLI
through its ACP server (`kimi acp`). On enrolled hosts the CLI must be
installed on that host.

## Requirements

- Kimi Code CLI on the machine: <https://github.com/MoonshotAI/kimi-code>
  (`curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash`).
- Sign-in on the same machine: `kimi login` (device-code flow). A thread that
  fails auth surfaces bb's typed `authRequired` state; sign in on the host and
  retry.

## Per-session options

The model picker lists the models kimi reports for the session
(`kimi-code/k3`, `kimi-code/k3-256k`, `kimi-code/kimi-for-coding`,
`kimi-code/kimi-for-coding-highspeed` as of CLI 2.2.0). The reasoning-level
picker maps onto kimi's thinking levels: Low / High / Max.

## Modes and commands

- kimi's slash commands (`/compact`, `/status`, `/usage`, skill commands)
  appear in the composer's `/` menu from the live session.
- kimi's mode selector (Default / Plan / Auto / YOLO) is published as the
  session's `mode` option and sits in the composer footer; pick Plan there or
  use bb's `/plan` composer action for read-only planning.
- bb's own permission modes still gate approvals on top: `accept-edits`
  auto-approves workspace file edits, `full` approves everything. bb's
  `auto` mode is not offered — the ACP bridge cannot enforce it.

## Limits

- Video input is not available through ACP (the handshake advertises image
  only); audio is not supported by kimi itself.
- Fork is disabled (`fork: "none"`): kimi ≥ 2.3.0 locks each session to its
  owning process, and bb forks by asking a new kimi process to fork the
  still-live source session, which kimi rejects ("This session is in use by
  another Kimi Code process"). Re-enable only when kimi allows cross-process
  forks of live sessions.
- Thread archive and rename are not mirrored into kimi sessions.
- MCP servers come from kimi's own configuration (`/mcp-config`, config.toml),
  not from bb.

## Quota exhaustion

When the account's usage window is fully spent (the weekly 7-day window most
often), kimi's ACP server answers prompts with a bare `end_turn` and no
updates — the 429 never reaches the wire, so without the guard the thread
shows "The agent ended the turn without replying" and nothing else. The
plugin guards this: while a window is 100% used, a new turn fails immediately
with a typed rate-limit error naming the spent window and its reset time
(check the usage windows on the provider card). The guard reads the same
usage endpoint as the maintenance panel, fails open when the endpoint is
unreachable or stale, and `BB_KIMI_QUOTA_GATE=0` turns it off.
