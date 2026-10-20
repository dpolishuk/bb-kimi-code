---
type: Contract
title: Протокол provider bridge
description: Инварианты JSON-RPC моста между агентом и runtime bb — транспорт, грамматика дельт v3, жизненный цикл turn/item, recovery hints.
status: stable
stale_after: 2027-01-20T00:00:00Z
tags: [bb, provider, bridge, protocol, contract]
generated: { by: kimi-code/k3, at: "2026-10-20T10:52:46Z" }
verified: { by: kimi-code/k3, at: "2026-10-20T10:52:46Z" }
sources:
  - id: bridge-protocol
    resource: https://github.com/get-bb/bb/blob/e0f6fda5a02332bd4eb44183542a57f34f3263d7/docs/provider-bridge-protocol.md
    title: The bb Provider Bridge Protocol
    author: team:get-bb
  - id: echo-provider
    resource: https://github.com/get-bb/bb/tree/e0f6fda5a02332bd4eb44183542a57f34f3263d7/examples/plugins/echo-provider
    title: examples/plugins/echo-provider — эталонный минимальный провайдер
    author: team:get-bb
---

# Разделение труда

**Bridge знает диалект провайдера; runtime знает таймлайн.** Bridge парсит трафик своего агента в узкую грамматику семантических дельт (`thread/delta`); ассемблер дельт в runtime владеет всеми инвариантами таймлайна — mint id, жизненный цикл turn/item, порядок.[^bridge-protocol]

Bridge — это экспорт `experimental_providerBridge` из `bb.host`-артефакта плагина (через `experimental_defineProviderBridge` из `@get-bb/plugin-sdk/provider-bridge`), а не самостоятельная программа: бутстрап демона владеет argv, `dataDir`/`tempDir`, фреймингом stdin и сигналами. **Импорт модуля не должен ничего запускать.**[^bridge-protocol]

# Транспорт

- Line-delimited JSON-RPC 2.0 по stdin/stdout в обе стороны; независимые пространства id.[^bridge-protocol]
- Гигиена ответов (обязательно):
  - недекодируемый/невалидный запрос → `INVALID_PARAMS (-32602)` с issues; молчание = недебажный 30-секундный таймаут;
  - неизвестный метод → `METHOD_NOT_FOUND (-32601)`;
  - stdout охраняется от посторонних записей (всё не-протокольное читатель игнорирует).

# Версионирование

- `initialize` обменивает `{protocolVersion, capabilities}`; текущая версия протокола — **2**.[^bridge-protocol]
- `grammarVersions` — inclusive-диапазон грамматики `thread/delta`. Ассемблер говорит **только v3 (`[3, 3]`)**; диапазон, не включающий 3, отклоняется при spawn с читаемой ошибкой.[^bridge-protocol]
- Capability-факты handshake (`sessionRestore`, `fork`, `approvalEnforcedBy`, `steerMode`, `skills`...) репортит код, который их реализует — факт может только сузить декларацию провайдера, не расширить её.[^bridge-protocol]

# Идентификаторы

| Идентификатор | Кто mint'ит |
|---|---|
| `threadId` | сервер bb (для провайдера opaque, эхо verbatim) |
| `providerThreadId` | провайдер; durable handle сессии, возвращается из `thread/start`/`resume`/`fork`; никогда не из per-process счётчика |
| turn ids и item ids на `ThreadEvent` | **только ассемблер runtime** — ни провайдер, ни bridge |

Bridge передаёт provider-native id как vouched join-ключи на дельтах; ассемблер транслирует в обе стороны.[^bridge-protocol]

# Жизненный цикл turn (инварианты)

1. Каждый принятый `turn/start`/`turn/steer` достигает ровно одного терминального состояния: `accepted → dispatched → started → (completed | failed | interrupted)`. Acceptance едет через обязательный `input.accepted { clientRequestId }`.[^bridge-protocol]
2. Item/stream дельты никогда не открывают turn. Промпт, обработанный без работы, всё равно даёт пару `turn.open` + `turn.boundary`, иначе тред висит.[^bridge-protocol]
3. `thread/stop`: `interrupt` оседает активный turn как interrupted (settling-дельты эмитит bridge); `release` отсоединяет idle-сессию без фабрикации прерывания. **Все owed-дельты для треда — на проводе до ответа на stop**; ресурсы треда освобождены до или с ответом.[^bridge-protocol]
4. Runtime подстраховывает watchdog'ом: принятый turn без `turn/started` за отведённое время становится видимым событием `system/provider-turn-watchdog`, а не тихим зависанием.[^bridge-protocol]

# Дельты (грамматика v3, выдержки)

- Один streaming-диалект: `item.textDelta { key, channel, text }` / `item.textClose`; каналы — `agentMessage`, `reasoningText`, `reasoningSummary`, `plan`. Батчинг текстовых дельт — политика ассемблера (50 мс окно), bridge шлёт текст по мере поступления.[^bridge-protocol]
- Один usage-диалект: `usage { total, last, modelContextWindow }`; контекстный метр — отдельная дельта `contextWindow` (может нести `cost` и `snapshot`).[^bridge-protocol]
- Extension kinds `"<pluginId>/<name>"`: дельта `extension` (payload обязан нести `presentation`) и thread-scoped `extension.state` (latest snapshot wins). Сервер валидирует payload при ingest; несоответствие персистится как `provider/unhandled`, никогда не дропается.[^bridge-protocol]
- bb-инъецированные инструменты приходят в `dynamicTools[]` на `thread/start`/`resume`/`fork` со своей presentation; bridge штампует её (и `server: "bb"`) на `item.open`/`item.close` каждого вызова.[^bridge-protocol]

# Recovery hints — типизированные, не текстовые

`provider/recovery` — уведомление bridge → runtime: `{ kind: sessionArchived | authRequired | restartRecommended | staleTurn | rateLimited, message, retryable }`. Два носителя: при отклонении запроса hint едет в `error.data.recovery` (через `experimental_BridgeRecoveryError` или `sendError(id, code, message, { recovery })`); без запроса — отдельной нотификацией. Никогда оба сразу. Отсутствующий провайдер-CLI — `MISSING_EXECUTABLE (-32004)`, а не generic `BRIDGE_ERROR`.[^bridge-protocol]

# Дочерние процессы

Топология процессов — внутреннее дело bridge и невидима для runtime. Финализация детей — по `close`, не `exit`, с bounded grace; окружение детей строится по allowlist, своё унаследованное env вниз не протекает. Запуск провайдер-CLI — `experimental_spawnPortableProcess`, завершение — `experimental_killPortableProcess` (корректно на Windows).[^bridge-protocol]

# Референсы

- Минимальный эталон: `examples/plugins/echo-provider` (декларация + bridge + conformance-тесты, только публичный SDK).[^echo-provider]
- Самый большой рабочий пример: `plugins/provider-codex/src/bridge/bridge.ts`.[^bridge-protocol]
- Для ACP-агентов — готовый кит `@get-bb/plugin-sdk/provider-bridge/acp` с диалектами `acp`, `cursor`, `grok`, `omp`, `opencode`.

# Связанные документы

- [Декларация провайдера](/contracts/provider-declaration.md)
- [Проверка изменений плагина](/runbooks/verify-plugin-change.md)

[^bridge-protocol]: The bb Provider Bridge Protocol
[^echo-provider]: examples/plugins/echo-provider
