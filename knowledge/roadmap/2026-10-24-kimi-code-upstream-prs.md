---
type: Roadmap
title: "Upstream PR-план: расширение Kimi Code для полного покрытия фич в bb"
description: Семь аккуратных PR в MoonshotAI/kimi-code — по одному на пункт, с файлами, размером, эффектом для bb и порядком. Основано на карте исходников acp-server/agent-core-v2 (clone main, 2026-10-24).
status: draft
tags: [kimi, acp, upstream, roadmap]
generated: { by: kimi-code/k3, at: "2026-10-24T11:15:00Z" }
sources:
  - id: source-map
    resource: Локальные исследования /Users/dpolishuk/work/kimi-code (main), два explore-агента, 2026-10-24
    title: Карта acp-server, agent-core-v2 (session lock, fork, usage, plan, swarm, video)
    author: kimi-code/k3
---

# Контекст

Плагин покрывает всё, что kimi отдаёт по ACP (см. аудит в
[решении об ACP](../decisions/acp-over-custom-bridge.md)). Ниже — что осталось
и почему это только upstream. Каждый пункт = один PR.

Порядок — по соотношению ценность/размер. Конвенции репо (из AGENTS.md и
скиллов): PR-текст без упоминания AI-авторства; changeset обязателен
(`patch` по умолчанию, `major` — никогда без явного подтверждения);
`packages/agent-core-v2`, `kap-server`, `transcript` — зоны без комментариев;
тесты добавлять в существующие файлы; `packages/acp-server/` — контрактная
зона (потребители вне репо: Zed, VS Code), любое изменение wire — с учётом
потребителей; **внешние PR принимаются только на аппрувнутые maintainer'ом
issue (`/approve`) — сначала issue, потом PR**.

# PR 1 — Типизированный session.occupied на всех lifecycle-путях (small)

- **Факты:** prompt-путь уже отдаёт `-32600` с `data.code='session.occupied'`
  (`acp-server/src/session.ts:138-141`, mapPromptLaunchError; код движка
  `session.occupied`, `retryable: true` — `session/errors.ts:14-17`). Но
  `session/resume`/`load`/`fork` живой чужой сессии падают `-32603 Internal
  error` с текстом в `data.details` (проверено live-пробой 2026-10-23:
  `session/resume` → -32603). Блокировка — `lease()` в
  `workspace/sessionLifecycle/sessionLifecycleService.ts:556`.
- **PR:** один маппер ошибок lifecycle-методов (`server.ts` new/load/resume/
  fork), отдающий тот же typed `-32600` + `data.code`; текст — человеческий,
  как сейчас. Тесты: `test/lifecycle.test.ts`.
- **Эффект для bb:** мост сможет мапить occupancy в typed recovery hint без
  текст-матчинга (сейчас невозможно по нашим правилам).
- **Changeset:** patch (`@moonshot-ai/kimi-code`).

# PR 2 — Headless `kimi usage --json` (small)

- **Факты:** квота аккаунта уже машиночитаема: `packages/oauth/src/
  managed-usage.ts` (`fetchManagedUsage`, 5h/weekly/monthly/booster), сервис
  `IOAuthService.getManagedUsage` (`agent-core-v2/src/app/auth/authService.ts:285`),
  kap-server HTTP `routes/oauth.ts:274`. TUI `/usage` строит отчёт из того же
  (`apps/kimi-code/src/tui/commands/info.ts:149-255`). CLI-команды
  headless-вывода нет.
- **PR:** команда `kimi usage --json` в `apps/kimi-code/src/cli/` (sub-команда,
  как существующие headless-команды), переиспользует сервис, печатает JSON.
  Тесты: cli-sub тесты по аналогии.
- **Эффект для bb:** наш диалект `readUsage` сможет выполнить команду и
  распарсить JSON → `maintenance.usage` включается, bb покажет квоту.
- **Changeset:** minor (новая capability CLI).

# PR 3 — Plan-шаги в ACP из plan-сервиса (mid)

- **Факты:** сейчас `plan` sessionUpdate эмитится только из TodoList display
  блоков (`session.ts:799-803`, `events-map.ts:398-445`). План-модуль движка:
  `IAgentPlanService` (`features/plan/plan.ts`), PlanData `{id, content,
  path}`, ops PlanModeEnter/Cancel/Exit (`features/plan/planOps.ts`).
  `session/set_mode` → `acpModeToToggles` (`modes.ts:72-87`) → enterPlan/
  cancelPlan; ExitPlanMode tool несёт markdown-план, до ACP доходит только
  как `plan_review` текст (`convert.ts:297-318`).
- **PR:** подписка AcpSession на `IAgentPlanService` (или на plan ops) →
  `plan` sessionUpdate при входе в Plan-режим, при обновлении плана
  (ExitPlanMode с args.plan) и при выходе (пустой план). Тесты:
  `test/e2e-turn.test.ts` + config/plan-кейсы.
- **Эффект для bb:** мост уже мапит `plan` дельты в bb plan-steps → живой
  план-таймлайн вместо режима без плана.
- **Changeset:** minor.

# PR 4 — Прогресс AgentSwarm в tool_call_update (mid)

- **Факты:** рой запускает субагентов с событиями, которые ест TUI
  (`features/swarm/session/sessionSwarmService.ts`, `mirrorAgentRun` с
  `swarmIndex`, `parentToolCallId`; TUI: `agent-swarm-progress.ts`,
  `subagent-event-handler.ts:496-585`). ACP для AgentSwarm эмитит один
  tool_call + финальный результат; промежуточного прогресса нет
  (`events-map.ts`, `session.ts` onToolCall*). Swarm-режим отдельно:
  `IAgentSwarmService.enter/exit` (`features/swarm/agent/swarm.ts`),
  RPC `setSwarmMode` есть, в ACP_MODES (4 режима, `modes.ts:22-43`) его нет.
- **PR (два независимых куска, лучше два PR):**
  - 4a: маппинг engine AgentRun-событий роя (spawn/progress/complete членов,
    у которых `parentToolCallId` = toolCall роя) в `tool_call_update` того
    tool_call: title «N/M done» + content-строки. Тесты: e2e-turn с
    scripted provider.
  - 4b: значение `swarm` в `mode` configOption (`config-options.ts`,
    ACP_MODES), применяемое через set_config_option →
    `IAgentSwarmService.enter('manual')/exit()`. В bb селектор режима
    подхватит его автоматически (session-options).
- **Эффект для bb:** delegation-строка роя (наша классификация v0.2.9) будет
  живая, плюс режим Swarm в селекторе.
- **Changeset:** minor.

# PR 5 — Пул secondary_model как configOption (mid)

- **Факты:** секция `[secondary_model]` живёт в
  `agent-core-v2/src/session/subagent/configSection.ts`
  (SECONDARY_MODEL_SECTION, default_model/force/default_effort/models),
  потребляется Agent/AgentSwarm/tower. В klient/listModels/ACP не
  проецируется — пикер видит только primary-каталог.
- **PR:** `secondaryModel` configOption (category custom, select из пула)
  в `config-options.ts`; применение через set_config_option в session-
  scoped override, читаемый резолвером моделей субагентов. Тесты:
  `test/config.test.ts` + subagent-config тесты.
- **Эффект для bb:** настройка пула из UI bb; сейчас — только правка
  config.toml / update-config.
- **Changeset:** minor. Ценность ниже PR 1-4 — можно отложить.

# PR 6 — Video-ввод через ACP (mid, ценность gated)

- **Факты:** контент-модель движка уже поддерживает `video_url`
  (`agent-core-v2/src/human/llm/message.ts:43-47`; ReadMedia строит video
  part при `capability.video_in`; `llm-kimi/files.ts` грузит video). ACP:
  `convert.ts acpBlocksToContentParts` роняет неизвестные блоки; в
  `promptCapabilities` видео-флага нет.
- **PR:** приём кастомного `video` блока (kimi-расширение ACP) → video_url
  part; capability-флаг; документация в docs/en|zh/reference/kimi-acp.md.
  Тесты: convert.test.ts.
- **Оговорка:** клиентов, шлющих video-блоки, пока нет — bb умеет только
  image. Значение появится после bb-side поддержки видео-вложений для ACP.
- **Changeset:** minor. Делать после PR 1-4.

# PR 7 — Кросс-процессный fork живой сессии (large, design-first)

- **Факты:** блокер — `lease(sourceId)` → `sessionOccupiedError`
  (`sessionLifecycleService.ts:556`). Холодный путь форка уже читает всё с
  диска (`readMetaFromDisk:913`, `copySessionFiles:858-911`,
  `readSourceWireRecords:799-836` с repair truncation) — т.е. дизайн
  холодного источника готов. IPC к владельцу не существует;
  `ISessionLockService.takeover` (sessionLock.ts:109) — evict-only; релиз
  лока у idle-владельца через `SESSION_LOCK_RELEASE_DELAY_MS=3000`
  (`sessionRunGateService.ts:64-87`) уже даёт окно handoff, но состояние
  в памяти владельца (нефлашенные журналы) при живом форке рискует гонкой.
- **Путь:** сначала issue с дизайном (handoff-запрос к владельцу через
  lock-файл/`klient` RPC + flush-протокол), maintainer-аппрув, потом код.
  Самостоятельный «просто разрешить»-вариант опасен (молчаливая порча
  состояния — P0 по их review-правилам).
- **Эффект для bb:** вернём fork (`fork: "tip"`→реальный).

# Порядок и воркфлоу

1. Сначала issue по каждому пункту → `/approve` от maintainer (правило
   репо: внешние feature-PR только после аппрува issue).
2. PR 1 → 2 → 3 → 4a → 4b → 5 → 6; PR 7 отдельным дизайн-треком.
3. Каждый PR: write-pr skill, behavior-change таблица, changeset, тесты в
   существующих файлах, `pnpm lint` (check-no-comments), e2e пакета
   acp-server (`test/` — реальный engine на temp home).
4. Никаких упоминаний AI-авторства в коммитах/PR (правило репо).
