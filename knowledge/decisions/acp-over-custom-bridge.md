---
type: Decision
title: Kimi Code подключается через готовый ACP-кит, а не через собственный bridge
description: Почему провайдер Kimi Code — это реэкспорт bb ACP bridge с launch spec, а не самостоятельная реализация протокола.
status: stable
tags: [bb, kimi, acp, decision]
generated: { by: kimi-code/k3, at: "2026-10-20T11:26:30Z" }
verified: { by: kimi-code/k3, at: "2026-10-20T11:26:30Z" }
sources:
  - id: kimi-readme
    resource: https://github.com/MoonshotAI/kimi-code
    title: MoonshotAI/kimi-code README — Editor & IDE integration (ACP)
    author: team:moonshotai
  - id: kimi-acp-probe
    resource: Локальный пробник `kimi acp` (initialize + session/new), CLI 2.2.0, 2026-10-20
    title: Эмпирический handshake kimi acp
    author: kimi-code/k3
  - id: acp-kit
    resource: https://github.com/get-bb/bb/blob/e0f6fda5a02332bd4eb44183542a57f34f3263d7/docs/provider-plugin-api.md
    title: Provider plugin API — ACP bridge kit
    author: team:get-bb
---

# Решение

Плагин `bb-plugin-kimi-code` не реализует provider bridge сам: `host.ts`
реэкспортирует `experimental_acpProviderBridge` из
`@get-bb/plugin-sdk/provider-bridge/acp`, а `server.ts` передаёт
`acpLaunchSpec { command: "kimi", args: ["acp"] }` через
`experimental_bridgeOptions`.

# Основания (проверены эмпирически 2026-10-20)

- Kimi Code CLI имеет ACP-сервер: `kimi acp` (подтверждено README и
  `kimi acp --help`).[^kimi-readme]
- Пробник `initialize` к живому `kimi acp` (CLI 2.2.0) вернул:
  `loadSession: true`, `promptCapabilities: { image: true, audio: false,
  embeddedContext: true }`, `sessionCapabilities: { list, resume, close,
  delete, fork, additionalDirectories }`, authMethods: terminal login через
  `kimi login`.[^kimi-acp-probe]
- Пробник `session/new` вернул `configOptions`: `model` (kimi-code/k3,
  k3-256k, kimi-for-coding, kimi-for-coding-highspeed), `thinking`
  (category `thought_level`: low/high/max) и `mode` (default/plan/auto/yolo).
  bb ACP bridge читает модели из `configOptions` (`category === "model"`) и
  уровни рассуждения из `category === "thought_level"` — отдельный `modelCli`
  и `reasoningCli` в launch spec не нужны (проверено по коду
  `parseAcpConfigOptions` / `findAcpThoughtLevelConfigOption` в
  `@get-bb/plugin-sdk` 0.6.49–0.6.54).
- Handshake generic ACP bridge: `fork: "tip"`, `approvalEnforcedBy: "runtime"`,
  `grammarVersions: [3, 3]`, `skills.configure: true` — поэтому декларация
  заявляет `fork: "tip"` и все три permission modes.

# Последствия

- Совместимость с удалёнными машинами даёт сам bb: host-артефакт с bridge
  доставляется на enrolled-хосты контент-адресуемо, `kimi` должен быть
  установлен и залогинен на хосте.[^acp-kit]

# Аудит покрытия возможностей kimi (2026-10-20, по коду bridge 0.6.49)

Поддержано: треды/turn'ы, resume и fork (проверено live conformance 16/16),
каталог моделей и уровни thinking из `configOptions`, `/compact` (bridge
мапит standalone `/compact` на `session/prompt` с текстом `/compact` —
функция `startCompaction`), image-ввод, скиллы из `.kimi-code/skills` и
`.agents/skills` (user + project roots), permission modes (enforce'ит
runtime, `approvalEnforcedBy: "runtime"`).

Не поддерживается generic-китом (проверено по `dist/provider-bridge-acp.js`):

- **Plan mode**: `promptMode` в ACP bridge не обрабатывается, а
  `plugins/provider-acp` заявляет `composerActions: []` для всех агентов.
  Изначальная декларация `composerActions: ["plan"]` была ошибкой и
  удалена в тот же день.
- **Slash-команды kimi** (`available_commands_update`) не публикуются как
  `bb/provider-commands` — в композере bb их нет.
- **`mode` selector** (default/plan/auto/yolo) не публикуется как
  `bb/session-options`; вместо него — permission modes bb.
- **Video-ввод**: в ACP `promptCapabilities` видео нет (image: true,
  audio: false).
- **Usage/quota и управление установкой**: `maintenance.usage/installation`
  выключены — стабильного машинного интерфейса у kimi для этого не найдено.

[^kimi-readme]: MoonshotAI/kimi-code README
[^kimi-acp-probe]: Локальный пробник kimi acp, 2026-10-20
[^acp-kit]: Provider plugin API — ACP bridge kit
