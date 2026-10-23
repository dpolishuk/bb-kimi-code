---
type: Incident
title: "Декларация обещала permission mode auto, который ACP-мост отклоняет: thread.start падает"
description: Тред на kimi-code с permission mode auto падает «Provider "Kimi Code" does not support permission mode "auto"» — SDK acp-next бросает на auto в двух местах, а декларация плагина заявляла все три режима; сужено до accept-edits/full, как у встроенных ACP-провайдеров bb.
status: stable
tags: [bb, kimi, incident, permission-mode, acp]
generated: { by: kimi-code/k3, at: "2026-10-23T12:55:00Z" }
verified: { by: kimi-code/k3, at: "2026-10-23T13:00:00Z" }
sources:
  - id: thread-error
    resource: bb thread messages thr_v5fvsnn7m6, 2026-10-23
    title: 'Command thread.start failed: Provider "Kimi Code" does not support permission mode "auto".'
    author: kimi-code/k3
  - id: sdk-throw-sites
    resource: "@get-bb/plugin-sdk 0.6.49 dist/provider-bridge-acp-next.js: buildAcpSessionParams и reconcileExecutionSettings, 2026-10-23"
    title: 'безусловные throw на permissionMode "auto" в обоих путях (создание сессии и смена настроек)'
    author: kimi-code/k3
  - id: builtin-precedent
    resource: bb.app builtin-plugins provider-acp(-next)/dist/server.js, 2026-10-23
    title: 'встроенные ACP-провайдеры bb декларируют permissionModes: ["accept-edits","full"]'
    author: kimi-code/k3
---

# Симптом

`bb thread create --provider kimi-code --permission-mode auto ...` создаёт
тред, но запуск падает: `Command thread.start failed — Provider "Kimi Code"
does not support permission mode "auto".` (тред thr_v5fvsnn7m6,
2026-10-23).[^thread-error] То же воспроизводится из UI, когда композер стоит
в режиме «Approve for me» (это и есть bb-режим `auto`).

# Корень

bb-режим `auto` («Approve for me»: запросы ревьюит авто-ревьюер bb, рискованное
возвращается пользователю) не имеет эквивалента в ACP: мост сам enforce'ит
только `accept-edits` (проверка путей против workspaceWriteRoots) и `full`
(одобрять всё). Поэтому SDK `acp-next` **безусловно бросает** на `auto` в обоих
путях — `buildAcpSessionParams` (создание сессии) и
`reconcileExecutionSettings` (смена настроек живой сессии).[^sdk-throw-sites]
Тот же бросок зашит во встроенные ACP-провайдеры bb (provider-acp и
provider-acp-next в bb.app), и они декларируют ровно
`["accept-edits", "full"]`.[^builtin-precedent]

Наша декларация заявляла `["accept-edits", "auto", "full"]` — расхождение с
мостом, прямое нарушение ISP из AGENTS.md: bb валидировал режим по декларации
и честно диспатчил тред в бросающий мост. Замаскировать маппингом `auto` →
`full`/`accept-edits` нельзя: семантика bb-`auto` (AI-ревьюер) не совпадает ни
с одним из них, тихое расширение прав было бы хуже честного отказа.

# Фикс

- `server.ts`: `permissionModes: ["accept-edits", "full"]` + комментарий причины.
- Пин правила в `server.test.ts`: отдельный тест с обоснованием (по образцу
  fork-пина); RED → GREEN подтверждены прогоном.
- Тексты: README и `skills/kimi-code/SKILL.md` больше не обещают `auto`;
  аудит в [решении об ACP](../decisions/acp-over-custom-bridge.md) исправлен.

# Верификация

- Юнит: 24/24, `tsc` чист (RED показывал 2 падения до фикса).
- Live против v0.2.3 (`kimi-code@0.2.3 running`, 2026-10-23): тред без
  `--permission-mode` (путь дефолта композера) — turn завершён, файл создан
  (thr_8jvc42i7u7); тред с `--permission-mode full` — turn завершён
  (thr_v8xdurr2we); `--permission-mode auto` отклоняется на создании:
  `HTTP 400: Provider kimi-code only supports accept-edits, full permission
  mode.` Демо-треды заархивированы.
