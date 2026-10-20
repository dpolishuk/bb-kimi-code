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

# Аудит покрытия возможностей kimi (финал 2026-10-20, SDK 0.6.49)

Плагин использует entrypoint `provider-bridge/acp-next` (не `/acp`): в
опубликованных SDK 0.6.49 и 0.6.54 только acp-next публикует
`bb/provider-commands` и `bb/session-options` (`publishSessionSnapshot`) и
поддерживает регистрацию диалектов (`experimental_registerAcpDialect`).
acp-next помечен в документации bb как deprecated alias — риск при апгрейде
SDK зафиксирован в `host.ts`.

Поддержано и live-проверено против `kimi acp` 2.2.0:

- треды/turn'ы, resume, fork — conformance 16/16;
- каталог моделей и уровни thinking из `configOptions`;
- slash-команды kimi (`/compact`, `/status`, `/usage`, skill-команды) —
  публикуются как `bb/provider-commands` (live-тест
  `kimi-live.session-state.test.ts`);
- селектор mode (default/plan/auto/yolo) — публикуется как
  `bb/session-options` с `category: "mode"` (composer footer); plan mode
  доступен через него. Прямой `composerActions: ["plan"]` не заявлен:
  `promptMode` bridge игнорирует;
- `/compact` — маппится на `session/prompt` "/compact";
- установка из bb: диалект `kimi` отдаёт install-план официального скрипта
  (live: `provider/installation/status` для отсутствующего бинаря);
- sign-in статус: OAuth-файл или api_key в config.toml → health `ready`
  (live); JWT kimi не содержит email — email всегда null;
- image-ввод, embedded context; permission modes enforce'ит runtime.

Не поддерживается (вердикт с основаниями):

- **Video-ввод** — невозможно через ACP: в `promptCapabilities` есть только
  image/audio (kimi: image true, audio false), контент-блока видео в
  протоколе нет. Это ограничение протокола, не плагина.
- **Usage/quota аккаунта** — у kimi нет машинного интерфейса квоты (ни CLI-
  команды, ни поля конфигурации); `readUsage` честно возвращает
  `{ supported: false }`, `maintenance.usage` выключен. Токены сессии
  доступны через `/usage` в треде.
- **Профили агентов** (`--agent/--agent-file`), `kimi vis`, `export` —
  CLI-фичи вне ACP.
- **MCP** — работает через собственную конфигурацию kimi (`/mcp-config`,
  config.toml), bb им не управляет.

[^kimi-readme]: MoonshotAI/kimi-code README
[^kimi-acp-probe]: Локальный пробник kimi acp, 2026-10-20
[^acp-kit]: Provider plugin API — ACP bridge kit
