---
type: Incident
title: "Reasoning picker показывал только «Thinking On»: bb daemon запускал старый kimi-cli 0.23.5"
description: Почему в bb не было уровней reasoning для kimi-code — shadowing бинаря kimi старой версией из Homebrew, и как это диагностировали.
status: stable
tags: [bb, kimi, incident, path, debugging]
generated: { by: kimi-code/k3, at: "2026-10-20T19:36:38Z" }
verified: { by: kimi-code/k3, at: "2026-10-20T19:36:38Z" }
sources:
  - id: bb-db
    resource: ~/.bb/bb.db, таблица provider_model_catalogs, 2026-10-20
    title: Кэш каталога моделей bb по хостам
    author: kimi-code/k3
  - id: old-kimi-probe
    resource: Локальный пробник `/opt/homebrew/bin/kimi acp` (0.23.5), 2026-10-20
    title: session/new старого CLI отдаёт thinking values ["on"]
    author: kimi-code/k3
---

# Симптом

В пикере модели bb для провайдера kimi-code секция Reasoning показывала одну
кнопку «Thinking On» без уровней. Создание треда до v0.1.1 дополнительно
падало с «does not support medium reasoning level» (отдельный баг, исправлен
в v0.1.1).

# Корень

На машине пользователя (MacBook Pro) стоят **два** `kimi`:

- `/opt/homebrew/bin/kimi` — Homebrew `kimi-code` **0.23.5**, старый kimi-cli;
- `~/.kimi-code/bin/kimi` — Kimi Code CLI **2.2.0**.

Интерактивный shell пользователя ставит `~/.kimi-code/bin` раньше в PATH,
поэтому ручные пробы шли на 2.2.0 и давали правильные уровни. Демон bb
резолвит `kimi` по своему PATH, где `/opt/homebrew/bin` раньше, — и запускал
0.23.5, чей ACP репортит `thinking` как бинарный тоггл (values `["on"]`).
[^old-kimi-probe]

# Как диагностировали

1. `bb provider models kimi-code --json` — живой каталог bb: все модели
   `["on"]`, тогда как прямая проба bridge — правильные уровни.
2. `~/.bb/bb.db`, таблица `provider_model_catalogs`: две строки с разным
   содержимым — по `host_id` выяснилось, что «on»-каталог с MacBook Pro, а
   правильный — с Mac mini.[^bb-db]
3. `bb updates status --json`: на MacBook Pro kimi 0.23.5 из Homebrew, на
   Mac mini — 2.x из `~/.kimi-code/bin`.
4. Прямая проба `/opt/homebrew/bin/kimi acp`: `session/new` → thinking
   values `["on"]` — воспроизведено.[^old-kimi-probe]

# Фикс

Удалить/обновить старый пакет на машине: `brew uninstall kimi-code` (0.23.5),
чтобы демон резолвил `~/.kimi-code/bin/kimi`. После этого bb перепробирует
каталог (TTL кэша ~10 минут или перезапуск bb).

# Урок

Провайдер-плагин, запускающий CLI по имени, наследует PATH-хаос машины.
Диагностику начинать с `bb provider models <id> --json` и
`bb updates status --json` (версии CLI по хостам), а не с кода bridge.
