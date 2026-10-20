# Directory Update Log

## 2026-10-20

* **Update**: Аудит покрытия kimi по коду ACP bridge: удалён сверхзаявленный `composerActions: ["plan"]`, добавлены skill-roots `.agents/skills`; матрица покрытия — в [решении об ACP](decisions/acp-over-custom-bridge.md). Тесты 11/11, сборка зелёная.
* **Creation**: Создан плагин `bb-plugin-kimi-code` v0.1.0 (server/host/icon/skill/тесты); зелёные: 11/11 юнит-тестов, `tsc`, `bb plugin build`, live conformance против `kimi acp` 16/16.
* **Creation**: Добавлено решение [ACP вместо собственного bridge](decisions/acp-over-custom-bridge.md) с основаниями из живого handshake.
* **Update**: [Состояние репозитория](project-state.md) переписано: репозиторий больше не пустой скелет, зафиксированы результаты проверок и новые открытые вопросы.
* **Initialization**: Создан корпус OKF v0.2: [индекс](index.md), [состояние репозитория](project-state.md), [поверхности плагина](architecture/bb-plugin-surfaces.md), контракты [декларации провайдера](contracts/provider-declaration.md) и [протокола bridge](contracts/provider-bridge-protocol.md), [ранбук проверки изменений](runbooks/verify-plugin-change.md). Источники запиннены на коммит bb `e0f6fda` и коммит OKF SPEC `ad30107`; содержимое сверено с документами по этим ссылкам в день создания.
