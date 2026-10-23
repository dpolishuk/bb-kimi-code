# Directory Update Log

## 2026-10-22

* **Update**: Аудит swarm и secondary model против kimi 2.3.0 (live-дамп
  provider-commands/session-options + llms-full.txt) — в [решении об ACP](decisions/acp-over-custom-bridge.md):
  swarm-мод и `/swarm` — TUI-only, через ACP не экспонируются (тул `AgentSwarm`
  доступен агенту, живой turn не проверялся); secondary model — config.toml
  kimi, работает прозрачно, из bb настраивается через `update-config`. Дамп
  также расширил список публикуемых команд (14 + skill:*) против трёх в аудите 2.2.0.
* **Update**: Codex-ревью PR #1 поднял P1: handshake моста заявлял `fork:
  "tip"` (хардкод SDK) против декларации `none`. По TDD добавлена обёртка
  `narrowInitializeForkOnBridge` (`src/handshake-fork.ts`, `host.ts`):
  переписывает `fork` в initialize-ответе; conformance-kit теперь сам
  исключает `session/fork-identity` — пин live-теста переписан под это
  (правило отсутствует, остальные зелёные). Юнит 23/23, tsc, build, live
  (conformance, session-state, models, maintenance) зелёные. Подробности — в
  [инциденте](incidents/2026-10-22-kimi-23-session-lock-breaks-fork.md) и
  [решении об ACP](decisions/acp-over-custom-bridge.md).

* **Update**: Аудит-дельта покрытия против kimi 2.3.0 (свежие пробы handshake/
  session/new + релиз-ноты) — в [решении об ACP](decisions/acp-over-custom-bridge.md):
  новых ACP-инструментов нет; handshake добавил `additionalDirectories`
  (мост bb корни не пробрасывает — upstream-кандидат), `auth.logout`
  (поверхности вызова в bb нет), kimi не эмитит `plan/update`; сессии
  монопольны (bb-тред + интерактивный kimi на одной сессии конфликтуют).
* **Fix**: kimi CLI тихо самообновился до 2.3.0 и сломал fork: live conformance
  падал на `session/fork-identity` («This session is in use by another Kimi
  Code process»). Диагноз двухпроцессным пробником: kimi 2.3.0 держит
  эксклюзивный лок сессии на процесс, а bb форкает новым процессом — конфликт
  моделей, отключения лока нет. Декларация сужена до `fork: "none"`, в live
  conformance-тесте исход правила запинован, точный пин версии в
  maintenance-тесте заменён на semver-паттерн. Подробности в
  [инциденте](incidents/2026-10-22-kimi-23-session-lock-breaks-fork.md);
  тексты (README/PLUGIN_OVERVIEW/SKILL) больше не обещают fork.
* **Update**: Открытый вопрос про SDK закрыт проверкой: в 0.6.68 `/acp` и
  `/acp-next` всё ещё раздельны и оба хардкодят `fork: "tip"` — апгрейд
  отложен, причина зафиксирована в [состоянии репозитория](project-state.md).

## 2026-10-20

* **Update**: Инцидент закрыт: после `brew uninstall kimi-code` демон bb перестал находить `kimi` (у приложения macOS урезанный PATH, без `~/.kimi-code/bin`) — добавлен симлинк в `/opt/homebrew/bin`; живой `bb provider models` подтвердил low/high/max. Детали в [инциденте](incidents/2026-10-20-shadowed-kimi-binary.md).

* **Update**: Репозиторий стал bb-маркетплейсом: `marketplace.json` в корне (валидирован по официальной схеме через ajv), `PLUGIN_OVERVIEW.md` по правилам витрины, тег `v0.1.0` для range-установки, [docs/marketplace.md](../docs/marketplace.md) — инструкции для пользователей и релизный цикл.
* **Update**: Добавлены [docs/architecture.md](../docs/architecture.md) и [docs/setup.md](../docs/setup.md) — обзор архитектуры плагина и пошаговая установка в bb; README ссылается на них. Репозиторий запушен на github.com/dpolishuk/bb-kimi-code (public, MIT).
* **Update**: Ревизия покрытия: live-тест turn'а с реальным tool call (kimi-live.tools.test.ts); по исходникам kimi-code подтверждены маппинг инструментов, субагенты (tool-строки), AskUserQuestion (approval с вариантами). Найдено отладкой: turn/start требует providerThreadId и clientRequestId формата creq_ + 10 base32-символов.
* **Update**: Полное покрытие возможностей: переход на acp-next bridge (slash-команды и mode-селектор в bb), kimi-диалект с maintenance (install-план, sign-in detection, usage verdict); вердикты невозможности для видео и квоты — в [решении об ACP](decisions/acp-over-custom-bridge.md). Git инициализирован, работа коммитится поэтапно; [состояние репозитория](project-state.md) обновлено.
* **Update**: Аудит покрытия kimi по коду ACP bridge: удалён сверхзаявленный `composerActions: ["plan"]`, добавлены skill-roots `.agents/skills`; матрица покрытия — в [решении об ACP](decisions/acp-over-custom-bridge.md). Тесты 11/11, сборка зелёная.
* **Creation**: Создан плагин `bb-plugin-kimi-code` v0.1.0 (server/host/icon/skill/тесты); зелёные: 11/11 юнит-тестов, `tsc`, `bb plugin build`, live conformance против `kimi acp` 16/16.
* **Creation**: Добавлено решение [ACP вместо собственного bridge](decisions/acp-over-custom-bridge.md) с основаниями из живого handshake.
* **Update**: [Состояние репозитория](project-state.md) переписано: репозиторий больше не пустой скелет, зафиксированы результаты проверок и новые открытые вопросы.
* **Initialization**: Создан корпус OKF v0.2: [индекс](index.md), [состояние репозитория](project-state.md), [поверхности плагина](architecture/bb-plugin-surfaces.md), контракты [декларации провайдера](contracts/provider-declaration.md) и [протокола bridge](contracts/provider-bridge-protocol.md), [ранбук проверки изменений](runbooks/verify-plugin-change.md). Источники запиннены на коммит bb `e0f6fda` и коммит OKF SPEC `ad30107`; содержимое сверено с документами по этим ссылкам в день создания.
* **Fix**: v0.1.1 — bb отклонял создание треда («Provider kimi-code does not support medium reasoning level»): bb стартует треды с medium по умолчанию и валидирует по лестнице провайдера. В лестницу добавлен medium («Medium (Kimi default)»); bridge его не мапит, kimi остаётся на своём дефолте high. Тег v0.1.1 запушен.
* **Fix**: Диагностировано «Reasoning: Thinking On» в пикере: уровни reasoning приезжают per-model из кэшированного `model/list`; у пользователя кэш был от пробы, где kimi репортил бинарный thinking (on/high — как у K2.7 Highspeed и сейчас). Свежая проба: K3 отдаёт low/high/max. Обновление плагина инвалидирует кэш (digest бандла в fingerprint). Добавлен live-тест kimi-live.models.test.ts, фиксирующий per-model правду.
* **Incident**: [«Thinking On» вместо уровней reasoning](incidents/2026-10-20-shadowed-kimi-binary.md) — демон bb запускал старый kimi-cli 0.23.5 (Homebrew) вместо Kimi Code 2.x из-за порядка PATH; диагностировано через bb.db и прямую пробу старого бинаря. Troubleshooting в docs/setup.md дополнен.
