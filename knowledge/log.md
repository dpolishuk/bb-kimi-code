# Directory Update Log

## 2026-11-09

* **Feature (v0.2.18)**: Kimi Code добавлен в панель bb **Provider usage**. Исследование
  bb-zcode `bb83d18` показало, что `maintenance.usage` и bridge
  `provider/usage` недостаточны: панель обнаруживает server-side
  `provider-usage.v1`. Добавлены discoverable list/get RPC, host-scoped Kimi
  resources, маппинг 5h/weekly/custom окон, 60-секундный кэш, refresh bypass,
  coalescing и failure states. Измерения идут через `system.usageLimits` в
  существующий host bridge, поэтому enrolled hosts поддержаны без передачи
  credentials на server. RED: отсутствовал `src/usage-contract.js`; GREEN: 3
  focused tests, полный набор 70 passed/11 live skipped, typecheck и build.
  Live `kimi-live.maintenance.test.ts` прошёл. Codex review выявил zero-limit
  booster cost, который скрывал все окна за schema validation; добавлена
  нормализация только cost в `null` и regression test. PR branch установлен:
  Kimi Code виден в Provider usage; daemon credential вернул expired, поэтому
  live-окна в панели не проверялись. Контракт записан в
  [Provider usage panel](contracts/provider-usage-panel.md).

## 2026-11-06

* **Fix + compatibility (v0.2.17)**: у delegation Agent больше не отображается сырой JSON
  аргументов. В треде `thr_jpqnmhht9f` (события 447–449) generic
  `item/toolCall/progress` содержал `{description, prompt, subagent_type, ...}`:
  SDK 0.6.90 не имел normalization-хука для не-command tool calls. SDK обновлён
  до 0.6.116, где доступен хук из
  [get-bb/bb#6769](https://github.com/get-bb/bb/pull/6769);
  `normalizeKimiToolCallEvent` отфильтровывает snapshots и точный argument echo
  по `mergedCall.rawInput`, сохраняя реальные progress/result. RED: 2 failing
  tests; GREEN: dialect 31/31. Полный набор **78/78** прошёл отдельно на
  **kimi 2.4.1** и **2.5.0** (19 файлов, unit + live); typecheck и build
  зелёные. Подробности и границы — в
  [решении об ACP](decisions/acp-over-custom-bridge.md). Исторические события
  таймлайна не изменяются, fix применяется к новым вызовам.

## 2026-11-02 (аудит покрытия kimi 2.3.1–2.4.1)

* **Audit**: изменений плагина не требуется — вся новая поверхность kimi
  2.3.1–2.4.1 либо уже поддерживается автоматически, либо вне ACP. Живая
  проба 2.4.1 (initialize/session/new без промптов): capabilities идентичны,
  +модели k3.1-pro/k3.1-pro-highspeed (пикер data-driven; live-тест моделей
  зелёный), +команды check-kimi-code-docs / import-from-cc-codex /
  mcp-config / sub-skill* / update-config / write-goal (авто-публикация в
  composer). Дельта и вердикты — в
  [решении об ACP](decisions/acp-over-custom-bridge.md), секция
  «Аудит-дельта против kimi 2.4.1». README: список моделей актуализирован.
* **Update (fork)**: 2.3.1 добавил `KIMI_CODE_SESSION_LOCK=0`; live-проба
  2026-11-02 — кросс-процессный `session/fork` живой сессии с ним работает.
  Решение `fork: "none"` оставлено (риск torn-копии при mid-turn fork);
  аддендум и условия возврата — в
  [инциденте](incidents/2026-10-22-kimi-23-session-lock-breaks-fork.md).
* **Update (квота)**: промпт-проба 2026-11-02 — квота ещё исчерпана
  (сброс 2026-11-02T16:58:56Z), silent `end_turn` воспроизводится; в канарейке
  2.5.0 #4541 (queue ACP requests until startup completes) — вероятный фикс
  асинхронного режима; заметка в
  [квота-инциденте](incidents/2026-11-01-kimi-quota-silent-turns.md). Полный
  live-набор — по-прежнему хвост после сброса квоты (включая plan-mode на
  2.4.1).

## 2026-11-01

* **Incident + Fix**: v0.2.16 — треды kimi-code «падают пустотой» при
  исчерпанной квоте: acp-server отвечает на 429 пустым `end_turn` без
  update'ов, ошибка не видна на проводе. Диагноз по wire.jsonl сессии, живой
  ACP-пробе и `GET /coding/v1/usages` (`limit_7d.used_ratio = 1`). Fix:
  `gateQuotaExhaustedTurns` (src/quota-gate.ts) — на turn/start проверяет
  usage-окна и при исчерпанном окне отвечает типизированным `rateLimited`
  (окно + время сброса), fail-open при любой неопределённости; kill-switch
  `BB_KIMI_QUOTA_GATE=0` (в тестах — vitest.setup.ts). Юнит 9 + live-тест
  композиции с реальным спавном; живой прогон на исчерпанном аккаунте
  подтверждает. Заодно README перестал обещать «no usage API» (неактуально с
  v0.2.11). Детали в
  [инциденте](incidents/2026-11-01-kimi-quota-silent-turns.md); обновлены
  [решение об ACP](decisions/acp-over-custom-bridge.md), README, skill.
  Открытый хвост: полный live-набор прогнать после сброса квоты
  (2026-11-02T16:58:56Z); отдельный режим acp-server — мгновенный пустой
  ответ с асинхронной работой — кандидат в upstream issue.

## 2026-10-31

* **Fix**: v0.2.15 — у Bash-тулколлов bb больше не показывает сырой JSON
  аргументов в выводе команды. По живой записи kimi acp 2.4.1
  (`BB_PROVIDER_BRIDGE_RECORD_DIR`): аргументы стримятся кумулятивными
  JSON-снапшотами в ACP content text, затем in_progress-апдейт несёт rawInput
  с `content === JSON.stringify(rawInput)`, и только после него начинается
  реальный вывод (с rawOutput). Диалект реализует штатный хук
  `normalizeCommandEvent` (`src/kimi-command-echo.ts`): content-снапшоты до
  rawInput подавляются, точное echo на переходе и на close вырезается, фаза
  хранится per toolCallId и сбрасывается на terminal-статусе. Проверки:
  51/51 + typecheck + `bb plugin build`; live end-to-end (2 Bash-команды,
  12 echo-апдейтов в сыром потоке) — 0 утечек в исходящие дельты, реальный
  вывод, включая JSON-вывод команды, проходит без потерь. Ограничение:
  progress-JSON у Agent и прочих не-command тулколлов остаётся — в диалекте
  нет хука для их progress-текста, нужна точка в bb core
  (`packages/provider-bridge-acp`, `extractAcpToolCallOutputText`).
