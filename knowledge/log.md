# Directory Update Log

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
