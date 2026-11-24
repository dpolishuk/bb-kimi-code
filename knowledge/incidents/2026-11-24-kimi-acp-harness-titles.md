---
okf_version: "0.2"
id: 2026-11-24-kimi-acp-harness-titles
title: Kimi ACP fallback-тайтлы подхватывают system instructions bb
status: verified
created: 2026-11-24
verified:
  by: kimi-code
  at: "2026-11-24T18:32:04Z"
stale_after: "2027-02-24"
sources:
  - id: bb-events
    resource: bb thread log thr_ehf9d554a8 thr_cr6pwss6d6 thr_bueg2r7pxd
    title: События thread/name/updated source=agent и metadata-completed reason=too-short
  - id: kimi-title-source
    resource: https://github.com/MoonshotAI/kimi-code/blob/a8f643ad2e7f197d6ec4409b7cdad8a544afad86/packages/agent-core-v2/src/agent/prompt/promptMetadataText.ts#L8-L10
    title: Kimi 2.7.3 titleFromPromptMetadataText возвращает prefix исходного prompt
  - id: verification
    resource: agent-title-filter.test.ts и kimi-live.thread-title.test.ts, прогоны 2026-11-24
    title: RED/GREEN regression, полный unit, typecheck, build и live ACP conformance
---

# Kimi ACP fallback-тайтлы подхватывают system instructions bb

## Симптом

В sidebar bb треды `kimi-code` получают имя `<system_instructions> If the user
asks you to...`. Особенно воспроизводимо на коротком первом сообщении (`hi`,
`продолжи`): metadata title service bb пропускает генерацию с `reason:
"too-short"`, после чего виден agent-originated title от Kimi.

## Причина

Generic ACP bridge добавляет инструкции bb первым text block первого prompt в
виде `<system_instructions>...`. Kimi 2.7.3 сохраняет этот объединённый текст в
`lastPrompt`; если session ещё untitled, `titleFromPromptMetadataText` просто
берёт его первые 200 символов и ставит `titleKind: "replaceable"`. ACP
`session_info_update` передаёт этот title в SDK, а SDK публикует
`thread.name` с `source: "agent"`.

Санитайзер из v0.2.13 (`src/kimi-title.ts`) стоит на другом пути: он вызывается
только AI-сервисом bb через `experimental_aiServices.complete` и не видит
agent-originated ACP titles. Поэтому его unit-тесты зелёные, а исходный симптом
сохраняется.

## Fix (v0.2.19)

`src/agent-title-filter.ts` добавляет outermost lifecycle-обёртку
`suppressHarnessAgentTitlesOnBridge`. На `start` она оборачивает stdout bridge и:

- удаляет `thread.name` только при `source: "agent"` и title, начинающемся с
  полного тега `<system_instructions>`, `<system_reminder>` или
  `<system-reminder>`; closing `>` обязателен, поэтому более длинные похожие
  имена вроде `<system-reminder-guide>` сохраняются;
- удаляет целиком JSON-RPC notification, если других дельт в нём нет;
- сохраняет genuine Kimi titles (включая текст о тегах не в начале строки) и все
  unrelated deltas без изменений;
- восстанавливает stdout на `onClose`, `onSigterm` и `onSigint`.

После подавления bb использует уже сгенерированный title либо свой
`titleFallback` с исходным пользовательским сообщением. Внутренний
`state.json` Kimi и уже сохранённые плохие названия старых bb-тредов эта правка
не переписывает.

## Проверка

- RED: live-тест на реальном `kimi acp` получал title, начинающийся с
  `<system_instructions>`; unit regression отсутствовал до реализации.
- GREEN: `agent-title-filter.test.ts` — 2/2; полный unit в изолированном fake
  account HOME — 72 passed / 12 live skipped; `tsc --noEmit` чист.
- `bb plugin build` собрал `dist/server.js` и `dist/host.js`; на этой машине BB
  потребовался `NODE_PATH=/usr/lib/node_modules` для разрешения
  `npm/package.json`.
- Live `kimi-live.thread-title.test.ts` прошёл и на `host.ts`, и на собранном
  `dist/host.js`; canonical conformance — все 15 применимых правил, плюс
  session-state. Без fake account HOME два старых maintenance unit-теста
  зависят от отсутствующих локальных credentials; это baseline, не новый сбой.

## Upstream-кандидат

Kimi может формировать replaceable title из display-only пользовательского
текста вместо полного ACP prompt. Альтернатива на стороне bb SDK — dialect hook
для `session_info_update`, чтобы плагину не требовался stdout boundary.
