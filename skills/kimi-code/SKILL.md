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

- `/compact` compacts the conversation context: bb's builtin compact
  affordance is mapped by the ACP bridge onto kimi's `/compact` command.
- Approval behavior is governed by bb's permission modes, which bb enforces
  itself: `accept-edits` auto-approves file edits, `auto` adds commands and
  tool calls, `full` approves everything.

## Limits

- Plan mode is not wired through the generic ACP bridge; the composer offers
  no plan action for this provider.
- kimi's slash commands (`/status`, `/usage`, skill commands, and similar)
  are not surfaced in bb's composer menu, and kimi's `mode` selector
  (default/auto/yolo) is not exposed either — use bb permission modes.
- Video input is not available through ACP (the handshake advertises image
  only); audio is not supported by kimi itself.
- Fork is supported at the session tip only (`fork: "tip"`); checkpoint forks
  are rejected.
- Thread archive and rename are not mirrored into kimi sessions.
- MCP servers come from kimi's own configuration (`/mcp-config`, config.toml),
  not from bb.
