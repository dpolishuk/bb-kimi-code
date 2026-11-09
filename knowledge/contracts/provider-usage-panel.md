---
okf_version: "0.2"
type: Contract
title: Provider usage panel и provider-usage.v1
description: Как Kimi usage с host bridge попадает в федеративную панель bb Provider usage на локальных и enrolled hosts.
status: verified
stale_after: 2027-02-09
tags: [bb, provider, usage, quota, rpc]
sources:
  - id: zcode-federation
    resource: https://github.com/dpolishuk/bb-zcode/commit/bb83d180d5bfa03ec3dace038445ad260bea792d
    title: bb-zcode — регистрация provider-usage.v1 для панели
    author: team:dpolishuk
  - id: acp-source
    resource: https://github.com/get-bb/bb/tree/3572d271032c04dc7287b66e6638c8fea9acb8b7/plugins/provider-acp/src
    title: bb provider-acp — актуальные usage-contract и usage-source
    author: team:get-bb
  - id: panel-contract
    resource: https://github.com/get-bb/bb/blob/3572d271032c04dc7287b66e6638c8fea9acb8b7/plugins/provider-usage/usage-source-contract.ts
    title: bb provider-usage — wire contract панели
    author: team:get-bb
generated: { by: kimi-code, at: "2026-11-09" }
verified: { by: kimi-code, at: "2026-11-09" }
---

# Два разных usage-интерфейса

`maintenance.usage: true` и ответ bridge на `provider/usage` не добавляют
провайдера в панель **Provider usage**. Панель не вызывает bridge напрямую:
она федеративно обнаруживает server-side RPC
`provider-usage.v1.listResources` и читает ресурсы через
`provider-usage.v1.getResource`. Оба метода регистрируются с
`experimental_discoverable: true`. Это подтверждено исправлением bb-zcode
`bb83d18` и актуальным контрактом bb.[^zcode-federation][^panel-contract]

# Поток данных Kimi

`server.ts` регистрирует источник из `src/usage-source.ts`. Инвентаризация
читает только `hosts.list` и `providers.list({capability: "usage"})`, не
запрашивает квоту. Для каждого host создаётся ресурс с
`id = JSON.stringify([hostId, "kimi-code"])` и
`scope = {kind: "host", hostId, hostName}`.

Измерение идёт по пути server → `system.usageLimits({hostId, providerId,
refresh})` → daemon `provider/usage` → существующий `readKimiUsage` на том
host. Поэтому OAuth credentials остаются на машине пользователя, а enrolled
hosts работают без копирования секретов на bb server.

# Маппинг и lifecycle

- `5h limit` → `kind: "five-hour"`; `Weekly limit` → `"weekly"`; monthly и
  booster → `"custom"`. Каждое окно получает стабильный id
  `${index}:${label}`, `model: null` и nullable `cost`. При неположительном
  `cost.limitUsdCents` только стоимость нормализуется в `null`; остальные
  usage-окна сохраняются, поскольку panel contract требует положительный лимит.
- `accountKey` и `plan` по умолчанию `null`: текущий Kimi usage endpoint не
  предоставляет эти данные. `accountEmail` и `planLabel` сохраняются, а
  отсутствующие поля старых bridge-ответов нормализуются в `null`.
- Успешные измерения кэшируются на 60 секунд; `refresh: true` обходит кэш.
  Одновременные чтения одного ресурса coalesce'ятся, а forced refresh ждёт
  текущее чтение и затем делает новое измерение.
- Отключённый host возвращает usage `status: "error"` без обращения к
  bridge. Малformed ID, удалённый host или чужой provider отклоняются как
  несуществующий ресурс. Ошибки сбора возвращают generic message без сетевых
  или секретных деталей; `observedAt` последнего успеха сохраняется.

Контракт и поведение проверены тремя тестами `usage-source.test.ts` через
реальный fake-host RPC harness, включая discovery, маппинг, кэш, refresh,
concurrency, stale resources и failure states. Live-тест
`kimi-live.maintenance.test.ts` подтверждает реальный host-side
`provider/usage`. После установки PR branch визуальная проверка подтвердила
ресурс Kimi Code в **Settings → Provider usage**. В daemon bb использовался
просроченный OAuth credential, поэтому панель показала корректный expired
state; отображение live-окон в панели в этой проверке не выполнялось.

[^zcode-federation]: bb-zcode, commit `bb83d180d5bfa03ec3dace038445ad260bea792d`.
[^panel-contract]: get-bb/bb, commit `3572d271032c04dc7287b66e6638c8fea9acb8b7`.
