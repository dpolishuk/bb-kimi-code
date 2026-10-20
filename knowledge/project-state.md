---
type: Project State
title: Состояние репозитория bb-kimi-code
description: Репозиторий — bb provider plugin `bb-plugin-kimi-code` v0.1.0 для Kimi Code CLI через ACP; тесты и сборка зелёные, git не инициализирован.
status: stable
tags: [project, state]
generated: { by: kimi-code/k3, at: "2026-10-20T11:26:30Z" }
verified: { by: kimi-code/k3, at: "2026-10-20T11:26:30Z" }
sources:
  - id: repo-ls
    resource: /Users/dpolishuk/work/bb-kimi-code
    title: Наблюдение файловой системы и прогоны тестов/сборки 2026-10-20
    author: kimi-code/k3
  - id: live-conformance
    resource: Локальный прогон `BB_KIMI_LIVE=1 npx vitest run kimi-live.conformance.test.ts`, 2026-10-20
    title: Live conformance против реального kimi acp — 16/16 проверок зелёные
    author: kimi-code/k3
---

# Наблюдаемые факты (проверены 2026-10-20)

- Репозиторий — bb provider plugin `bb-plugin-kimi-code` v0.1.0: `server.ts`
  (декларация провайдера), `host.ts` (реэкспорт ACP bridge), `icons/kimi.svg`,
  `skills/kimi-code/SKILL.md`, тесты, `package.json` с манифестом `bb`.
  Решение об архитектуре: [ACP вместо собственного bridge](/decisions/acp-over-custom-bridge.md).[^repo-ls]
- Проверки зелёные: `vitest run` — 11/11 юнит-тестов; `tsc --noEmit` чист;
  `bb plugin build` собирает `dist/server.js` и `dist/host.js` (SDK 0.6.49,
  bb 0.46.1).[^repo-ls]
- Live conformance против реального `kimi acp` (CLI 2.2.0,
  `BB_KIMI_LIVE=1`) — 16/16 проверок канонического набора, включая
  `turn/lifecycle` (реальный turn на модели), `session/resume-*` и
  `session/fork-*`.[^live-conformance]
- Git-репозиторий отсутствует (`git status` → «не найден git репозиторий»);
  README и CI нет.[^repo-ls]
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
- Нет инициализации git — история и атрибуция изменений недоступны; решение о
  `git init` за владельцем.

# Исправления декларации (2026-10-20)

Аудит покрытия по коду bridge выявил сверхдекларацию: `composerActions:
["plan"]` удалён (generic ACP bridge игнорирует `promptMode`); добавлены
skill-roots `.agents/skills` (kimi реально их читает). Полная матрица
покрытия — в [решении об ACP](/decisions/acp-over-custom-bridge.md).

[^repo-ls]: Наблюдение файловой системы и прогоны 2026-10-20
[^live-conformance]: Live conformance против реального kimi acp, 2026-10-20
