---
okf_version: "0.2"
---

# База знаний bb-kimi-code

Инженерные знания для разработки bb provider plugin (агент-харнесс) в этом репозитории. Правила использования корпуса — в корневом [AGENTS.md](../AGENTS.md), раздел «Использование базы знаний».

# Состояние проекта

* [Состояние репозитория bb-kimi-code](project-state.md) — что реально лежит в репозитории: provider plugin `bb-plugin-kimi-code` v0.1.0, статус проверок, открытые вопросы.

# Решения

* [ACP вместо собственного bridge](decisions/acp-over-custom-bridge.md) — Kimi Code подключается через готовый ACP-кит bb; основания из живого handshake `kimi acp`.

# Архитектура

* [Поверхности bb-плагина](architecture/bb-plugin-surfaces.md) — из чего состоит плагин (server/host/app/skills), где выполняется каждая часть, модель доверия и доставки.

# Контракты

* [Декларация провайдера](contracts/provider-declaration.md) — контракт `bb.providers.register`: capabilities, модели, env, extension kinds.
* [Протокол provider bridge](contracts/provider-bridge-protocol.md) — инварианты JSON-RPC моста: грамматика дельт v3, жизненный цикл turn/item, recovery hints.

# Ранбуки

* [Проверка изменений плагина](runbooks/verify-plugin-change.md) — как проверять изменения: TDD-цикл, conformance kit, record/replay, команды `bb plugin`.

# Инциденты

* [Shadowing бинаря kimi: «Thinking On» вместо уровней](incidents/2026-10-20-shadowed-kimi-binary.md) — bb daemon запускал старый kimi-cli 0.23.5 из Homebrew вместо Kimi Code 2.x; диагностика через bb.db и пробы.
