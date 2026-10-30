---
type: Runbook
title: Проверка изменений bb-плагина
description: Как проверять изменения плагина — TDD-цикл, conformance kit, record/replay паритет и команды bb plugin.
status: stable
stale_after: 2027-01-20T00:00:00Z
tags: [bb, testing, verification, tdd]
generated: { by: kimi-code/k3, at: "2026-10-20T10:52:46Z" }
verified: { by: kimi-code/k3, at: "2026-10-20T10:52:46Z" }
sources:
  - id: providers-ref
    resource: https://github.com/get-bb/bb/blob/e0f6fda5a02332bd4eb44183542a57f34f3263d7/plugins/bb-guide/skills/bb-plugin-authoring/references/providers.md
    title: bb-plugin-authoring — Agent provider API (Testing a bridge)
    author: team:get-bb
  - id: quickstart
    resource: https://github.com/get-bb/bb/blob/e0f6fda5a02332bd4eb44183542a57f34f3263d7/plugins/bb-guide/skills/bb-plugin-authoring/references/quickstart.md
    title: bb-plugin-authoring — Plugin quickstart (builds and installs)
    author: team:get-bb
  - id: echo-provider
    resource: https://github.com/get-bb/bb/tree/e0f6fda5a02332bd4eb44183542a57f34f3263d7/examples/plugins/echo-provider
    title: examples/plugins/echo-provider — как это доказано
    author: team:get-bb
---

# Когда применять

Любое изменение provider-плагина (декларация, bridge, UI) перед утверждением «готово». Работаем по TDD: RED → GREEN → REFACTOR (см. корневой [AGENTS.md](../../AGENTS.md)).

В этом репозитории дополнительно есть gated live-тесты против реального
`kimi acp` (нужны установленный и залогиненный kimi; conformance тратит
несколько токенов на один turn):

```
BB_KIMI_LIVE=1 npx vitest run kimi-live.conformance.test.ts \
  kimi-live.session-state.test.ts kimi-live.maintenance.test.ts \
  kimi-live.tools.test.ts kimi-live.plan-mode.test.ts
```

# Шаги

## 1. Юнит и контрактные тесты (пишутся первыми, до реализации)

- **Conformance**: `experimental_runBridgeConformance` из `@get-bb/plugin-sdk/provider-bridge/testing` гоняет канонический набор правил по bridge in-process: транспорт `send` → bridge, `takeMessages` дренит захваченный stdout (`experimental_captureBridgeJsonRpcOutput`). Эталон: `provider-bridge.conformance.test.ts` в echo-provider.[^providers-ref]
- **Stream-тест**: прогон дельт bridge через реальный ассемблер кита, ассерты на канонических событиях. Эталон: `provider-bridge.stream.test.ts`.[^echo-provider]
- **Server-тест**: загрузка плагина в публичный fake host (`@get-bb/plugin-sdk/testing`) и ассерты на сохранённой декларации.[^echo-provider]
- **Тест правила импортов**: запрет `@bb/*` и относительных импортов за пределы плагина (эталон — `public-sdk-only.test.ts` в echo-provider).[^echo-provider]
- Моки только на границах (процессы, сеть, FS); тестируем контракты плагина, не поведение хоста.

## 2. Сборка

```
bb plugin build    # обязательно перед install/release/marketplace
bb plugin types    # при дрейфе версий деклараций SDK
```

`bb plugin build` не требует запущенного сервера; падение сборки при path/git-инсталле валит инсталл.[^quickstart]

## 3. Живой прогон (когда изменение затрагивает поведение)

```
bb plugin install .     # первый раз (--yes без промпта)
bb plugin dev           # пересборка app/host бандлов + reload на каждом сохранении
bb plugin reload <id>   # после правок установленного плагина
```

`bb plugin dev` требует запущенный bb.[^quickstart]

## 4. Record/replay паритет (для bridge с реальным провайдером)

- Запись: запустить host-демон с `BB_PROVIDER_BRIDGE_RECORD_DIR=<dir>` и прогнать тред на провайдере; bridge с дочерним CLI дополнительно вызывает `experimental_recordProviderChildIo` сразу после `spawn()`.[^providers-ref]
- Записи редактируются (redact) и коммитятся в плагин; реплей — `experimental_replayRecording`, дифф — `experimental_compareParity`. Эталон: `provider-bridge.parity.test.ts`.[^providers-ref]
- При намеренном изменении потока: `experimental_rerecordCurrentBridgeLane` пишет `bridge→runtime.current.ndjson` рядом с записью; сама запись никогда не перезаписывается.[^providers-ref]

### Как это сделано в этом репозитории (с 2026-10-23)

Полный `replayRecording` поднимает bridge субпроцессом с replay-обёрткой —
машинерия рассчитана на матрицу bb (`packages/provider-parity`); для плагина
используем облегчённый уровень, держащий ту же цель (дрейф граммары и
классификации):

- Запись: `BB_KIMI_LIVE=1 BB_KIMI_FIXTURE_RECORD=recordings/<name>.ndjson npx
  vitest run kimi-live.<name>.test.ts` — live-тест дампит выходные
  bridge-нотификации в ndjson, редактируя путь воркспейса и id сессии.
- Коммит фикстуры в `recordings/`; реплей in-process:
  `experimental_assembleCapturedThreadEvents(fixture, "kimi-code")` гоняет
  дельты через настоящий ассемблер SDK (см. `fixtures.test.ts` — пин
  delegation-классификации).
- Субпроцессный `replayRecording` остаётся доступным в SDK; поднимаем его,
  если понадобится дифф двух версий моста (compareParity) против одной записи.

# Критерии готовности

1. Все применимые conformance-правила зелёные; stream/parity/unit-тесты зелёные.
2. `bb plugin build` проходит.
3. При живой проверке — предъявлен вывод команд. Утверждения без доказательств не принимаются.

# Связанные документы

- [Протокол provider bridge](/contracts/provider-bridge-protocol.md)
- [Поверхности bb-плагина](/architecture/bb-plugin-surfaces.md)

[^providers-ref]: bb-plugin-authoring — Agent provider API
[^quickstart]: bb-plugin-authoring — Plugin quickstart
[^echo-provider]: examples/plugins/echo-provider
