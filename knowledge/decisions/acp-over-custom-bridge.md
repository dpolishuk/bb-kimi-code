---
type: Decision
title: Kimi Code подключается через готовый ACP-кит, а не через собственный bridge
description: Почему провайдер Kimi Code — это реэкспорт bb ACP bridge с launch spec, а не самостоятельная реализация протокола.
status: stable
tags: [bb, kimi, acp, decision]
generated: { by: kimi-code/k3, at: "2026-10-20T19:36:38Z" }
verified: { by: kimi-code/k3, at: "2026-10-20T19:36:38Z" }
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
  - id: audit-23
    resource: Свежие пробы handshake/session/new против kimi acp 2.3.0 и сверка с релиз-нотами, 2026-10-22
    title: Аудит-дельта покрытия kimi 2.3.0
    author: zcode
  - id: incident-23
    resource: knowledge/incidents/2026-10-22-kimi-23-session-lock-breaks-fork.md
    title: Инцидент session lock kimi 2.3.0 (fork живой сессии)
    author: zcode
  - id: swarm-dump
    resource: Live-дамп bb/provider-commands и bb/session-options через bridge против kimi acp 2.3.0 (thread/start без промпта), 2026-10-22; сверка с llms-full.txt moonshotai.github.io/kimi-code
    title: Полный список публикуемых команд и опций kimi acp 2.3.0
    author: zcode
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
  заявляла `fork: "tip"` и все три permission modes. С 2026-10-22 fork сужен
  до `none`: kimi 2.3.0 ввёл session lock, ломающий кросс-процессный fork
  живой сессии — см. [инцидент](../incidents/2026-10-22-kimi-23-session-lock-breaks-fork.md);
  handshake моста при этом сужен до `none` обёрткой в `host.ts` (SDK хардкодит `"tip"`).

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
- каталог моделей и уровни thinking из `configOptions`; лестница декларации
  включает `medium` (дефолт bb при создании треда), который bridge не мапит
  на значение kimi — kimi остаётся на своём текущем уровне (дефолт high),
  в пикере он подписан «Medium (Kimi default)»;
- slash-команды kimi (`/compact`, `/status`, `/usage`, skill-команды) —
  публикуются как `bb/provider-commands` (live-тест
  `kimi-live.session-state.test.ts`);
- селектор mode (default/plan/auto/yolo) — публикуется как
  `bb/session-options` с `category: "mode"` (composer footer); plan mode
  доступен через него. Прямой `composerActions: ["plan"]` не заявлен:
  `promptMode` bridge игнорирует;
- `/compact` — маппится на `session/prompt` "/compact";
- **tool-pайплайн**: live-проверен turn с реальным Write-инструментом
  (`kimi-live.tools.test.ts`): `item.open`/`item.close` с shape
  fileChange/command/tool доезжают, turn оседает. Важно: `turn/start` требует
  `providerThreadId` и `clientRequestId` формата `creq_` + 10 символов
  base32 — найдено отладкой по wire-дампу;
- маппинг инструментов kimi (Read/Write/Edit/Bash/WebFetch/Think →
  read/edit/execute/fetch/think) покрыт generic-классификацией — по коду
  `packages/acp-server/src/events-map.ts` в MoonshotAI/kimi-code;
- **субагенты** (инструмент `Agent`, kind `other`) приходят generic tool-
  строками — функционально; delegation-отображение — возможное улучшение
  диалекта (по коду `agent/tools/agent/agentTool.ts`);
- **AskUserQuestion** мапится kimi в ACP `session/request_permission` →
  approval с вариантами ответа в bb (по коду `acp-server/src/question.ts`);
  поэтому `supportsNativeUserQuestion: false` — вопросы работают, но не как
  нативные карточки;
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

# Аудит-дельта против kimi 2.3.0 (2026-10-22)

Свежий handshake и `session/new` против живого 2.3.0; релиз-нот новых
ACP-инструментов не содержат. Что изменилось против матрицы выше:

- handshake: `sessionCapabilities` пополнились `additionalDirectories`
  (соответствует CLI `--add-dir`), заявлены `mcpCapabilities {http, sse}` и
  `auth: {logout}`; `configOptions` не изменились (model ×4, thinking
  low/high/max, mode ×4).[^audit-23]
- **fork** — см. [инцидент 2026-10-22](../incidents/2026-10-22-kimi-23-session-lock-breaks-fork.md):
  multi-client session occupancy в 2.3.0 и есть тот лок; декларация и (с
  2026-10-22, обёртка в `host.ts`) handshake — `none`.
- **`additionalDirectories`** — gap SDK-моста: bb→bridge протокол имеет
  `additionalWorkspaceWriteRoots`, но мост шлёт агенту в `session/new` только
  `cwd`+`mcpServers` и корни не пробрасывает. Плагином не чинится (нет хука в
  setup сессии); практическое влияние не проверялось (нужен live multi-root
  turn). Кандидат в upstream-issue к get-bb/plugin-sdk.[^audit-23]
- **`auth.logout`** — kimi объявляет, SDK-клиент имеет request spec, но ни
  мост, ни bb не имеют поверхности вызова: выйти из аккаунта kimi через bb
  нельзя, только локально.[^audit-23]
- **ACP `plan/update`** — мост мапит в bb plan-steps, но kimi их не эмитит
  (в бинаре упоминаний нет): Plan-режим работает как mode, живого план-таймлайна
  от kimi в bb нет — ограничение провайдера.[^audit-23]
- **Сессии монопольны**: один kimi-session нельзя держать открытым
  одновременно в живом bb-треде и в интерактивном kimi (`-S`/`--continue`) —
  второй клиент получит occupancy-ошибку.[^incident-23]

## Дельта по swarm и secondary model (2026-10-22, live-дамп команд)

Живой дамп `bb/provider-commands` и `bb/session-options` против kimi acp
2.3.0 через наш bridge (thread/start без промпта):[^swarm-dump]

- команды: `compact`, `status`, `usage`, `mcp`, `tasks`, `help`,
  `check-kimi-code-docs`, `import-from-cc-codex`, `mcp-config`, `sub-skill`,
  `sub-skill.consolidate`, `sub-skill.review`, `update-config`, `write-goal`,
  плюс `skill:*` — против трёх (`compact`/`status`/`usage`) в аудите 2.2.0;
- session-options: только `mode` (default/plan/auto/yolo).

Вердикты:

- **Swarm-режим** (мод сессии + команда `/swarm` + прогресс-панель) — TUI/web
  -only, через ACP не экспонируется: ни mode-значения, ни `/swarm` в дампе
  команд.[^swarm-dump] При этом тул `AgentSwarm` — обычный инструмент агента:
  модель может вызвать его и в ACP-сессии (вне swarm-мода в manual — с
  approval; approval enforce'ит runtime bb); на таймлайне выглядит generic
  tool-строкой, как `Agent`. Живой turn с `AgentSwarm` не проверялся —
  вывод из документации и кода kimi-code (llms-full.txt, тул-спека).
  Delegation-отображение роя — то же возможное улучшение диалекта, что и для
  `Agent`.
- **Secondary model** (`[secondary_model]` / пул `[secondary_model.models]`,
  stable с 2.2.x) — конфигурация config.toml kimi, через ACP не управляется
  (`/secondary-model` в дампе команд отсутствует). Работает прозрачно
  kimi-стороны: пул даёт тулам `Agent`/`AgentSwarm` параметр `model`;
  настроить из bb-треда можно командой `update-config` (публикуется) или
  правкой `~/.kimi-code/config.toml`. bb-настройки плагина для пула нет —
  и не нужно: bb не владеет конфигом kimi.

[^swarm-dump]: Live-дамп provider-commands/session-options против kimi acp 2.3.0 (in-process bridge, thread/start без промпта), 2026-10-22; сверка с llms-full.txt moonshotai.github.io/kimi-code

[^audit-23]: Свежие пробы handshake/session/new против kimi 2.3.0 и сверка с релиз-нотами, 2026-10-22
[^incident-23]: Инцидент session lock, 2026-10-22

[^kimi-readme]: MoonshotAI/kimi-code README
[^kimi-acp-probe]: Локальный пробник kimi acp, 2026-10-20
[^acp-kit]: Provider plugin API — ACP bridge kit
