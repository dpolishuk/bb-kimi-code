---
okf_version: "0.2"
id: 2026-11-01-kimi-quota-silent-turns
title: Исчерпание квоты Kimi проявляется пустыми turn'ами
status: verified
created: 2026-11-01
verified:
  by: Dmitry Polishuk
  at: 2026-11-01
stale_after: "2027-01-01"
---

# Исчерпание квоты Kimi выглядит в bb как «agent ended the turn without replying»

## Симптом

Тред провайдера kimi-code (пример: thr_69426gk5e4, 2026-11-01) после
нормальной работы начинает отвечать пустотой: каждый turn длится ~3 c, ни
одного item; bb показывает warning «The agent ended the turn without
replying. The agent reported no error and sent nothing back». Статус turn'а
при этом `completed`, тред не падает.

## Диагностика

1. **Лог треда**: `provider/warning` (general) после каждого `turn/started`;
   `turn/completed status=completed` в ту же секунду. Контекст треда при этом
   далёк от лимита (737k/1M).
2. **Внутренний лог kimi-агента**
   `~/.kimi-code/sessions/wd_*/<sessionId>/agents/main/wire.jsonl`:
   `turn.ended reason=failed` с
   `error.name=APIProviderQuotaExhaustedError`, message
   «429 You've reached your weekly (7-day) usage limit...». Wire-лог дописан
   в момент «пустого» turn'а — агент реально пытался выполнить промпт.
3. **Живой пробник против `kimi acp`** (initialize → session/new →
   session/prompt «Say hi» на исчерпанной квоте): ответ
   `{"stopReason":"end_turn"}` за ~3 c, до него только `available_commands_update`
   и `session_info_update`, после — `usage_update`. Ни ошибки, ни
   agent-message, ни refusal: **429 не попадает на ACP-провод**.
4. **Эндпоинт usage** (`GET https://api.kimi.com/coding/v1/usages`, OAuth-токен
   из `~/.kimi-code/credentials/kimi-code.json`): `usages.limit_7d.used_ratio = 1`
   при `limit_5h.used_ratio = 0.11` — исчерпано именно недельное окно;
   `reset_time` указывает момент снятия блока.

## Причины (две независимые)

1. **Внешняя**: исчерпана недельная квота аккаунта Kimi (429 на каждый
   промпт). Лечится временем (reset) или докупкой/апгрейдом плана.
2. **Протокольная**: acp-server kimi проглатывает ошибку turn'а — отвечает
   `end_turn` без единого update. SDK-кит мапит `end_turn` в чистое
   completed, bb добавляет бессмысленный generic-warning. Пользователь не
   видит ни «квота», ни времени сброса.

Отдельный режим того же треда (кластер 14:22–14:26): acp-server отвечал на
`session/prompt` мгновенно пусто, а работу выполнял асинхронно — в bb
приходили только нестандартные нотификации `acp/fs/write` (provider/unhandled).
Не связано с квотой; ждёт отдельного upstream-issue.

## Fix (v0.2.16)

`src/quota-gate.ts` — обёртка `gateQuotaExhaustedTurns` в host.ts (внешняя в
композиции). На входящий `turn/start` читает usage-эндпоинт (тот же, что
maintenance; таймаут 2.5 c) и при окне с `used_ratio ≥ 1` и будущим
`reset_time` сам отвечает JSON-RPC ошибкой
`{code:-32000, data.recovery:{kind:"rateLimited", retryable:true}}` с меткой
окна (выбирается окно с ближайшим сбросом) и временем сброса; промпт в kimi
не уходит. Любая неопределённость — fail-open (строка проходит в базовый
бридж как есть): эндпоинт недоступен, статус не `ok`, ratio устарел (reset
прошёл), reset не указан, таймаут. `turn/steer` не гейтится (turn уже открыт).
Выключение: `BB_KIMI_QUOTA_GATE=0` (в тестах выставляет vitest.setup.ts).

Проверено: unit (quota-gate.test.ts, 9), live-композиция с инъектированным
usage против реального спавна `kimi acp` (kimi-live.quota-gate.test.ts),
живой прогон на исчерпанном аккаунте — turn/start отвечает rateLimited с
реальным `reset_time`. Полный live-набор повторить после снятия квоты.

## Upstream-кандидат

acp-server kimi должен сообщать о неудаче turn'а: либо error-response на
`session/prompt`, либо `stopReason:"refusal"` + session/update с ошибкой,
которую кит сможет перевести в recovery hint. Материал для issue в
MoonshotAI/kimi-code (дополнить к [PR-плану](../roadmap/2026-10-24-kimi-code-upstream-prs.md)).

## Sources

- Лог треда thr_69426gk5e4 (`bb thread log --all --json`), события 7210–7636.
- wire.jsonl сессии session_4a508eeb-… (turn.ended failed, 429).
- Проба ACP-провода на исчерпанной квоте, 2026-11-01 (initialize/new/prompt).
- Ответ `GET /coding/v1/usages` 2026-11-01: limit_7d used_ratio 1,
  reset_time 2026-11-02T16:58:56Z.
