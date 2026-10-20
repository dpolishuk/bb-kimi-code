---
type: Project State
title: Состояние репозитория bb-kimi-code
description: Репозиторий — bb provider plugin `bb-plugin-kimi-code` для Kimi Code CLI через acp-next bridge с kimi-диалектом; тесты и сборка зелёные, git инициализирован.
status: stable
tags: [project, state]
generated: { by: kimi-code/k3, at: "2026-10-20T12:11:59Z" }
verified: { by: kimi-code/k3, at: "2026-10-20T12:11:59Z" }
sources:
  - id: repo-ls
    resource: /Users/dpolishuk/work/bb-kimi-code
    title: Наблюдение файловой системы и прогоны тестов/сборки 2026-10-20
    author: kimi-code/k3
  - id: live-conformance
    resource: Локальные прогоны `BB_KIMI_LIVE=1 npx vitest run kimi-live.*`, 2026-10-20
    title: Live-проверки против реального kimi acp — conformance 16/16, session state, maintenance
    author: kimi-code/k3
---

# Наблюдаемые факты (проверены 2026-10-20)

- Репозиторий — bb provider plugin `bb-plugin-kimi-code` v0.1.0: `server.ts`
  (декларация), `host.ts` (acp-next bridge + регистрация диалекта),
  `src/dialect.ts`, `src/kimi-account.ts`, `icons/kimi.svg`,
  `skills/kimi-code/SKILL.md`, тесты (юнит + live gated `BB_KIMI_LIVE=1`).
  Покрытие возможностей: [решение об ACP](/decisions/acp-over-custom-bridge.md).[^repo-ls]
- Bridge — `@get-bb/plugin-sdk/provider-bridge/acp-next` (см. риск deprecated
  alias в `host.ts` и в решении).[^repo-ls]
- Проверки зелёные: `vitest run` — 20/20 юнит; `tsc --noEmit` чист;
  `bb plugin build` собирает `dist/server.js` + `dist/host.js` (SDK 0.6.49,
  bb 0.46.1). Live: conformance 16/16, session-state (commands +
  session-options), maintenance (health ready, install-план, usage
  unsupported).[^live-conformance]
- Git инициализирован 2026-10-20; работа коммитится поэтапно.[^repo-ls]
- `.npmrc` разрешает install-скрипты `better-sqlite3`, `node-pty`,
  `@parcel/watcher` — иначе npm блокирует сборку нативных аддонов bb-app.
- `.serena/` — стандартная конфигурация Serena; содержимое
  `project.local.yml` не инспектировалось.

# Harness-окружение (вне OKF bundle)

Работа ведётся из Kimi Code CLI; наборы скиллов лежат на уровне пользователя
(`~/.kimi-code/skills`, `~/.agents/skills`), а не в репозитории. Инструкции
harness живут в корневом [AGENTS.md](../AGENTS.md) и вне этого bundle.

# Открытые вопросы

- Установка плагина в запущенный bb (`bb plugin install .`) и работа на
  enrolled-хосте не проверялись end-to-end: на момент проверки был доступен
  только CLI из `bb-app`, без запущенного сервера.
- При апгрейде SDK перепроверить acp-next: если `/acp` и `/acp-next` сольются,
  вернуть импорт на `/acp` и прогнать live-тесты.

[^repo-ls]: Наблюдение файловой системы и прогоны 2026-10-20
[^live-conformance]: Live-проверки против реального kimi acp, 2026-10-20
