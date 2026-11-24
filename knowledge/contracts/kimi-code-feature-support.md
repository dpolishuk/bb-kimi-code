---
okf_version: "0.2"
id: kimi-code-feature-support
type: Contract
title: Поддержка возможностей Kimi Code CLI в bb-плагине
status: verified
created: 2026-11-24
verified:
  by: kimi-code
  at: "2026-11-24T20:28:31Z"
stale_after: "2026-12-24"
sources:
  - id: changelog
    resource: https://www.kimi.com/code/docs/en/kimi-code-cli/changelog.html
    title: Официальный changelog Kimi Code CLI 2.5.0–2.7.3
  - id: acp-reference
    resource: https://www.kimi.com/code/docs/en/kimi-code-cli/reference/kimi-acp.html
    title: Официальная capability matrix и покрытие методов `kimi acp`
  - id: plugin-release
    resource: https://github.com/dpolishuk/bb-kimi-code/tree/5140a66edf35ad4ab9107751b5db27ff6b8af8d0
    title: bb-plugin-kimi-code 0.2.19, релизный коммит
  - id: live-audit
    resource: BB_KIMI_LIVE=1 прогоны kimi-live.models/session-state/plan-mode/conformance и raw initialize против Kimi 2.7.3, 2026-11-24
    title: Живая проверка моделей, режимов, команд, resume и agentCapabilities
---

# Поддержка возможностей Kimi Code CLI в bb-плагине

## Область

Снимок относится к **Kimi Code CLI 2.5.0–2.7.3** и **bb-plugin-kimi-code
0.2.19**. Canary 2.8.0 и Desktop-релизы не входят. Плагин использует `kimi acp`,
поэтому возможности TUI, Web, Desktop и standalone server не становятся
bb-native UI автоматически.[^acp-reference]

Статусы ниже означают: **поддержано** — есть рабочий путь в bb;
**прозрачно** — работает внутри Kimi без отдельного кода плагина; **нет** —
плагин не предоставляет функцию; **не проверено** — совместимость ожидается по
контракту, но отдельного живого теста не было.

## Подтверждённая основа на Kimi 2.7.3

- **Модели и thinking**: `model/list` отдал все шесть доступных моделей —
  K2.8 Preview, K2.7 Code Highspeed, K3, K3-256k, K3.1 Pro и K3.1 Pro
  Highspeed. Per-model reasoning ladders сохраняются; пикер data-driven и не
  требует изменений при добавлении модели.[^live-audit]
- **Режимы**: Default / Plan / Auto / YOLO присутствуют в session options;
  `promptMode: "plan"` через bb Plan composer действительно переводит Kimi в
  Plan mode.[^live-audit]
- **Сессии**: start, prompt, stop, load/resume подтверждены conformance. Изменение
  2.7.0, разрешающее resume сессии, открытой в другом клиенте, прозрачно для
  плагина.[^live-audit]
- **Дополнительные каталоги**: `additionalDirectories` поддержаны в ACP и
  пробрасываются через используемый SDK 0.6.116; прежний SDK gap закрыт.
- **Команды**: ACP публикует `compact`, `status`, `usage`, `mcp`, `tasks`,
  `help`, `check-kimi-code-docs`, `import-from-cc-codex`, `mcp-config`,
  `sub-skill*`, `update-config`, `write-goal` и `skill:*`. Это не полный список
  TUI-команд.[^live-audit]
- **Tools и субагенты**: базовые tool events, Agent delegation и AgentSwarm
  workflow представлены через диалект; `/tasks` присутствует в ACP-командах.
  Нативный Kimi `/tasks` UI при этом в bb не воспроизводится.

## Изменения последних релизов

### 2.5.x

- **Смена `/model` и `/effort` во время работы агента** — модель и thinking можно
  выбрать через bb, но применение выбора именно во время активного turn на
  2.7.3 **не проверено**. В Kimi изменение действует со следующего turn.[^changelog]
- **Skills из primary и дополнительных каталогов** — **поддержано** на уровне
  ACP/native skill roots и `additionalDirectories`; конфликт имён решает Kimi.
  Отдельный multi-directory live-тест не выполнялся.
- **SSH, Docker и custom-command environments** — **нет** как интеграция с этим
  Kimi API. Вместо него bb использует собственные environments/enrolled hosts.
- **Workspace trust и permission rules** — **прозрачно** на стороне Kimi;
  сверху продолжают действовать bb permission modes.
- **Secondary model / Agent / AgentSwarm defaults** — **прозрачно** через
  `config.toml`; плагин не управляет этим пулом из bb.
- **2.5.1–2.5.3** — преимущественно исправления внутри Kimi, Web и MCP;
  отдельной работы плагина не требуют. Улучшенный steer использует существующий
  ACP-путь; bb также имеет собственные режимы steer/queue.

### 2.6.x

- **Fullscreen TUI, folding, copy-on-select, animation FPS** — **нет** как
  bb-native эквиваленты; это настройки отдельного TUI.
- **Сохранённые user/project permission rules** — **прозрачно** при старте ACP
  сессии; bb approvals остаются дополнительным внешним ограничением.
- **Tower artifact missions, key-deliverable review и human acceptance** —
  **нет**: Tower mission UI/протокол не экспонируется через используемый ACP.
- **Secondary model aliases и Tower reviewer defaults** — **прозрачно** через
  конфигурацию Kimi.
- **2.6.1–2.6.3** — исправления compaction, background notifications, MCP и
  восстановления сессий в основном прозрачны; новых обязательных hooks для
  плагина changelog не объявляет.[^changelog]

### 2.7.x

- **Follow-up behavior Steer в `/settings`** — **нет** как зеркало настройки
  Kimi. В bb выбор steer/queue выполняется собственным composer/CLI.
- **Foreground agents в `/tasks`** — **частично**: команда `tasks` и существующие
  delegation/workflow events доступны, но отдельный Kimi `/tasks` UI не
  воспроизводится.
- **Project/session titles в browser tab** — **нет** как Kimi Web-функция; bb
  самостоятельно управляет названиями своих тредов.
- **Kimi project SSH hosts** — **нет**; следует использовать машины и
  environments bb, а не ожидать применение Kimi SSH project configuration.
- **Amazon Bedrock models** — **не проверено**. По data-driven контракту
  модели должны появиться после настройки provider на стороне Kimi, но живого
  Bedrock account/probe в аудите не было.
- **Experimental next-prompt predictions** — **нет**. ACP reference прямо
  указывает, что optional `nes/*` surface не реализован, поэтому TUI prompt
  prediction нельзя предоставить через текущий `kimi acp`.[^acp-reference]
- **2.7.1–2.7.3** — исправления fork, queued prompts, model availability и
  Web/TUI поведения; они не расширяют ACP capability matrix.[^live-audit]

## Постоянные ограничения плагина

- **Fork** — `fork: "none"` в декларации, несмотря на upstream running и
  historical-turn fork. BB bridge рассчитан на tip fork, а исторический checkpoint
  не поддерживается. После изменений 2.5–2.7 стоит заново проверить живой fork и
  риск torn copy перед расширением декларации.[^plugin-release]
- **Rename/archive mirror** — bb titles/archive не зеркалируются в Kimi session;
  `supportsThreadRename` и `supportsThreadArchive` равны `false`.[^plugin-release]
- **Logout** — Kimi объявляет `auth.logout`, но плагин и bb maintenance surface
  не предоставляют соответствующего действия; используется локальный Kimi flow.
- **Audio/video** — Kimi ACP объявляет `audio: false`; video content block в
  используемой ACP prompt surface отсутствует.
- **Plan timeline** — Plan mode подтверждён, но получение полноценного live plan
  timeline от Kimi отдельно не проверялось и не следует из самого mode selector.

## Границы проверки

Live maintenance health на машине аудита вернул `unauthenticated`, поскольку
локальные OAuth credentials отсутствуют. Это ограничение среды проверки, а не
новый regression последних релизов. Модели, session-state, Plan mode, resume и
canonical ACP conformance при этом прошли.[^live-audit]

[^changelog]: [Официальный changelog Kimi Code CLI](https://www.kimi.com/code/docs/en/kimi-code-cli/changelog.html), разделы 2.5.0–2.7.3.
[^acp-reference]: [Официальный `kimi acp` reference](https://www.kimi.com/code/docs/en/kimi-code-cli/reference/kimi-acp.html), capability matrix и ACP method coverage.
[^plugin-release]: [bb-plugin-kimi-code 0.2.19](https://github.com/dpolishuk/bb-kimi-code/tree/5140a66edf35ad4ab9107751b5db27ff6b8af8d0), `server.ts` и `host.ts`.
[^live-audit]: Локальные прогоны 2026-11-24: raw `initialize` против `kimi acp` 2.7.3; `BB_KIMI_LIVE=1 npx vitest run kimi-live.models.test.ts kimi-live.session-state.test.ts`, отдельно `kimi-live.plan-mode.test.ts` и `kimi-live.conformance.test.ts`; maintenance health отдельно завершился `unauthenticated`.
