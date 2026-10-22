---
type: Incident
title: "kimi 2.3.0 сломал fork в bb: session lock запрещает кросс-процессный fork живой сессии"
description: Почему thread fork для kimi-code перестал работать и в conformance, и вживую — kimi 2.3.0 держит эксклюзивный лок сессии на процесс, а bb форкает новым процессом; декларация сужена до fork none, исход_rule запинован в live-тесте.
status: stable
tags: [bb, kimi, incident, fork, session-lock, acp]
generated: { by: zcode, at: "2026-10-22T19:35:00Z" }
verified: { by: zcode, at: "2026-10-22T19:35:00Z" }
sources:
  - id: live-conformance-23
    resource: BB_KIMI_LIVE=1 npx vitest run kimi-live, 2026-10-22
    title: session/fork-identity падает с SESSION_OCCUPIED против kimi 2.3.0
    author: zcode
  - id: two-process-probe
    resource: Двухпроцессный пробник ACP (initialize/session/new/session/fork/session/resume), 2026-10-22
    title: fork живой сессии из чужого процесса — error; после смерти владельца — ok; resume — ok
    author: zcode
  - id: kimi-binary-strings
    resource: strings ~/.kimi-code/bin/kimi (2.3.0), 2026-10-22
    title: sessionLock.ts из agent-core-v2; нет env/флага/конфига для отключения session lock
    author: zcode
  - id: sdk-bundles
    resource: "@get-bb/plugin-sdk dist 0.6.49 и 0.6.68, provider-bridge-acp(-next).js, 2026-10-22"
    title: initialize-ответ bridge хардкодит fork: "tip" в обеих версиях SDK
    author: zcode
---

# Симптом

`BB_KIMI_LIVE=1 npx vitest run kimi-live` после тихого самообновления kimi CLI
2.2.0 → 2.3.0: правило conformance `session/fork-identity` падает с
`{"code":-32000, ... "This session is in use by another Kimi Code process.
Stop the session in that process or exit it, then try again."}`. Отдельно
maintenance-тест падал на точном пине версии `2.2.0` (кормовой баг теста, не
провайдера).[^live-conformance-23]

# Корень

kimi 2.3.0 (движок agent-core-v2) вводит **эксклюзивный лок сессии на процесс**:
`~/.kimi-code/locks/sessions/session_<id>.lock` с pid владельца; повторный
`tryHold` из другого процесса даёт `SESSION_OCCUPIED`.[^kimi-binary-strings]
Лок проверяет живость pid: после смерти владельца fork и resume из нового
процесса работают.[^two-process-probe]

bb (acp-next bridge) форкает иначе: **новый** процесс агента на новый тред и
ему — `session/fork` исходной сессии, которая ещё жива в своём процессе. Итог:
fork живого треда всегда падает. Это не только тест — в реальном bb bridge
держит все сессии тредов в одном процессе, и fork из UI попадает в тот же
конфликт.[^two-process-probe]

Отключения лока нет: в бинаре 2.3.0 нет ни env (`KIMI_DISABLE_OAUTH_LOCK` —
только OAuth), ни флага `kimi acp --help`, ни ключа config.toml.[^kimi-binary-strings]

# Как диагностировано

1. Live conformance: единственное красное правило — `session/fork-identity`,
   с текстом SESSION_OCCUPIED.
2. Двухпроцессный ACP-пробник: A `session/new` → S; B1 `session/fork S` при
   живом A — error; A убит → B2 `session/fork S` — ok (новый sessionId);
   C `session/resume S` при мёртвом A — ok. Сема документирована точно.
3. `strings` бинаря: регион `agent-core-v2/.../sessionLock.ts`, env/флагов
   обхода нет.
4. SDK 0.6.49 и 0.6.68: initialize-ответ моста хардкодит `fork: "tip"`
   независимо от агента; диалектных хуков сузить capability нет, опций
   «правило неприменимо» в `runBridgeConformance` нет.[^sdk-bundles]

# Фикс (плагин не может починить fork — только перестать его обещать)

- `server.ts`: `fork: "none"` + комментарий с причиной. Эффективная
  capability bb = декларация ∩ handshake, так что UI больше не предлагает
  сломанный fork.
- `kimi-live.conformance.test.ts`: вместо `report.passed` тест запинивает
  текущую истину — всё зелёное, кроме `session/fork-identity`, который обязан
  упасть с SESSION_OCCUPIED. Когда пин сломается (kimi ослабит лок или SDK
  перестанет перезаявлять fork) — вернуть `fork: "tip"` и `report.passed`.
- `kimi-live.maintenance.test.ts`: точный пин версии заменён на semver-паттерн
  (CLI самообновляется молча).
- Тексты (README, PLUGIN_OVERVIEW, SKILL.md) больше не обещают fork.

Известная вынужденная расходимость: bridge продолжает репортить `fork: "tip"`
(хардкод SDK), декларация сужает до `none` — направление «декларация уже
handshake» допустимо (факты только сужают), но само узкое место — кандидат в
issue к get-bb/plugin-sdk (мост заявляет capability, не проверяя агента).

# Урок

Кросс-процессная модель fork'а bb и per-process session locks агента
несовместимы в принципе; при падении `session/fork-identity` сначала пробей
двумя процессами (живой/мёртвый владелец), чтобы отделить регрессию агента от
бага моста, и проверь, что initialize моста не перезаявляет capability.
Stale-локи (файлы от мёртвых pid в `~/.kimi-code/locks/sessions/`) безвредны —
живость pid проверяется.

[^live-conformance-23]: Live-прогоны conformance против kimi 2.3.0, 2026-10-22
[^two-process-probe]: Двухпроцессный ACP-пробник, 2026-10-22
[^kimi-binary-strings]: strings бинаря kimi 2.3.0, 2026-10-22
[^sdk-bundles]: Бандлы SDK 0.6.49/0.6.68, 2026-10-22
