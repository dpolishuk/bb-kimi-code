# Directory Update Log

## 2026-10-23

* **Update**: v0.2.8 — `@get-bb/plugin-sdk` 0.6.49 → 0.6.73. Gap'ы на месте
  (fork-хардкод, auto-throw, additionalDirectories — последний закрывает наш
  PR get-bb/bb#6180), апгрейд ради общих фиксов. Unit 32/32, live 40/40,
  build зелёный; обёртка fork в host.ts нужна по-прежнему.
* **Ops**: канарейка совместимости — bb-автоматизация `auto_e74usnxrvi4`
  (проект bb-kimi-code): ежедневно 07:17 Europe/Moscow гоняет полный
  live-сьют (`BB_KIMI_LIVE=1 npx vitest run`); тихий тик при зелёном,
  при падении печатает хвост вывода. Ручной прогон `arun_8rd-xymixkg`
  зелёный (exit 0, silent). Урок тихого авто-апдейта kimi 2.2.0→2.3.0.

* **Feature**: v0.2.7 — субагенты kimi (инструмент `Agent`) отображаются
  delegation-строками вместо generic tool: `classifyToolCall` в диалекте
  (прецеденты grok/cursor в SDK; `childRef` = toolCallId, label из
  `rawInput.description`, detail = тип субагента из «Launching <type>
  agent: ...»). Шейпы запинены в `dialect.test.ts` по записи
  `BB_PROVIDER_BRIDGE_RECORD_DIR`, end-to-end — новый live-тест
  `kimi-live.delegation.test.ts`. `AgentSwarm` не пробирован, остаётся
  generic.
* **Upstream**: PR [get-bb/bb#6180](https://github.com/get-bb/bb/pull/6180) —
  проброс `additionalWorkspaceWriteRoots` как `additionalDirectories` в
  `session/new`/`load`/`resume`/`fork` (гейт на capability). Тесты
  RED→GREEN (537/537 + typecheck + lint), заодно починен stale-roots при
  смене настроек живой сессии. PR автоматически закрыт contributor-гейтом
  (dpolishuk не в APPROVED_CONTRIBUTORS) — реопен после одобрения через
  Discord #contributors.
* **Вердикты проб ошибок kimi 2.3.0** (в [решении об ACP](decisions/acp-over-custom-bridge.md)):
  auth `-32000` мапится SDK в typed `authRequired` + подсказка `kimi login`;
  occupancy `-32603` без типизации (текст в `data.details`, SDK его доносит)
  — typed hint невозможен без поддержки kimi, текст-матчинг запрещён.

* **Tests**: аудит steer/cancel — live `kimi-live.steer.test.ts` зелёный:
  `turn/steer` во время активного turn'а (мост очередит ввод + `session/cancel`,
  kimi честно прерывает и отвечает на steer) и `thread/stop` interrupt
  оседают корректно. Заметка: kimi не сообщает provider turn id, а мост
  `expectedTurnId` не читает. Фикстуры record/replay: live-тесты умеют
  `BB_KIMI_FIXTURE_RECORD` (ndjson-дамп выхода моста с redact), коммит в
  `recordings/`, in-process реплей через `experimental_assembleCapturedThreadEvents`
  (`fixtures.test.ts`); подход зафиксирован в
  [ранбуке](runbooks/verify-plugin-change.md#4-recordreplay-паритет-для-bridge-с-реальным-провайдером).

* **Merge**: PR [get-bb/marketplace#651](https://github.com/get-bb/marketplace/pull/651)
  смёржен (approve от SawyerHood, 2026-10-23T14:04:58Z, merge `02708706`) —
  kimi-code опубликован в bb-community каталоге. Источник entry — range
  `^0.2.0`, поэтому каталог отдаёт последний тег в нём (на момент мержа уже
  v0.2.6): совместимые релизы не требуют новых PR. Скриншоты в витрине сняты
  до фикса иконки-маски (v0.2.4) — на них старый тёмный blob; обновление
  скриншотов = отдельный PR.

* **Update**: v0.2.5–v0.2.6 — K в маске иконки утяжелена для читаемости на
  16–20px (штрихи выреза 1.8 → 2.4 → 2.8pt на 24 viewBox, размах больше).
  Визуально проверено в живой пилюле композера.

* **Fix**: v0.2.4 — иконка провайдера больше не «пустой тёмный квадрат» в
  пилюле: bb рендерит логотипы провайдеров как currentColor-маски (силуэт
  цветом текста), многоцветный SVG схлопывался в blob. `icons/kimi.svg`
  переписан одноцветным: тайл-силуэт с evenodd-вырезами под K и точку;
  `strings.iconTint { light: #0A0A0C, dark: #FFFFFF }`. Пин —
  [icon.test.ts](../../icon.test.ts) (одна краска + evenodd), констрейнт
  записан в [контракт декларации](contracts/provider-declaration.md).
  Визуально проверено в живом UI через desktop-автоматизацию: K и точка
  читаются в пилюле композера.

* **Update**: Баннер README переработан под бренд Kimi (assets/banner.svg,
  1280×640 + экспорт banner.png для social preview): чёрный тайл с белой «K»
  и синей точкой, заголовок «Kimi Code for bb», три колонки — Use it
  (установка, маркетплейс, пикер), How it works (декларация, host-артефакт,
  `kimi acp` по stdio, live-пробы configOptions, permission modes) и Design
  ideas (ACP-кит вместо своего bridge, честная декларация, ничего не
  захардкожено, диалект maintenance, TDD). Рендер для сверки — `rsvg-convert`
  (qlmanage криво масштабирует SVG).

* **Submit**: плагин отправлен в bb-community marketplace —
  [get-bb/marketplace#651](https://github.com/get-bb/marketplace/pull/651)
  (ветка `submit-kimi-code` в форке dpolishuk/marketplace, один коммит:
  entry + иконка PNG 541a21b8 + 2 скриншота + overview из PLUGIN_OVERVIEW.md).
  Источник entry: git range `^0.2.0` (резолвится в v0.2.3 @ 73ce5a4).
  Проверки: marketplace build/check/gate:v1/test зелёные; плагин — 24/24,
  tsc, build, live-сьют. Скриншоты сняты desktop-автоматизацией локального UI
  (127.0.0.1:38886) через `p.screenshot({path})` в обход лимита 960px —
  bounded-шоты CLI для маркетплейса не подходят (мин. 1200px).
  Урок: build маркетплейса требует full git history (`git fetch --unshallow`)
  и закоммиченный entry (дату publishedAt берёт из истории).

* **Fix**: v0.2.3 — декларация больше не обещает permission mode `auto`:
  SDK acp-next бросает на нём в `buildAcpSessionParams` и
  `reconcileExecutionSettings`, а bb валидировал по декларации и диспатчил
  тред в бросок («Provider "Kimi Code" does not support permission mode
  "auto"», thread.start). Сужено до `["accept-edits", "full"]` по прецеденту
  встроенных ACP-провайдеров bb; пин в server.test.ts (RED→GREEN). Live:
  дефолтный тред и `full` работают, `auto` отклоняется на создании с HTTP 400.
  Подробности — в [инциденте](incidents/2026-10-23-acp-bridge-rejects-auto-mode.md).

* **Release**: v0.2.2 — иконка приведена к брендингу Kimi по референсу из
  треда: синяя точка уменьшена (r 1.75 → 1.05) и отделена от верхней диагонали
  «K» (в v0.2.1 наползала и сливалась с ней в пятно), радиус углов 6 → 4,
  штрихи 2.9 → 1.9. Проверка рендерами qlmanage на 512/32/16 px — читается на
  всех размерах. Тесты 23/23, build зелёный; live bb обновлён in-place
  (`kimi-code@0.2.2 running`).

* **Update**: Проверка «все ли опции kimi поддержаны в bb» (скриншот пикера):
  совпадение 1:1 тремя способами — live `model/list` через bridge,
  `bb provider models kimi-code --json` и пикер bb. Зафиксирован дрейф
  display-name (`kimi-for-coding` → «K2.8 Preview»), per-model лестницы
  thinking (K3-класс low/high/max, highspeed on/high) и цепочка применения
  уровня (`selectAcpNativeReasoning` → `session/set_config_option` verbatim,
  неизвестное опускается). Подробности — в [решении об ACP](decisions/acp-over-custom-bridge.md).

* **Release**: v0.2.1 — иконка плагина в стиле Kimi (чёрный скруглённый тайл,
  белая геометричная «K», синяя точка-акцент #3B5BFB по референсу из треда).
  Патч внутри `^0.2.0`: `bb plugin update kimi-code --yes` обновил живую
  установку in-place (0.2.0 → 0.2.1) без remove. Иконка рендерилась через
  `qlmanage` для визуальной сверки с референсом.

* **Release**: v0.2.0 — PR #1 смёржен (rebase), версия поднята, тег на
  `b2dd99e`, каталог `^0.1.0`→`^0.2.0` (0.x-caret не пускает минорные бампы —
  правило в [docs/marketplace.md](../docs/marketplace.md)). Установлено в
  живой bb из маркетплейса (`kimi-code@0.2.0` running, `bb provider models`
  зелёный); старая установка требовала remove перед install из нового range.
  Подробности — в [состоянии репозитория](project-state.md).

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
