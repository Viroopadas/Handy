# LLM Translation Features

Документ-справка для двух реализованных функций перевода.

---

## 1. Перевод транскрипции (Post-Processing)

Автоматический перевод транскрибированного текста через LLM после пост-обработки.

### Пайплайн

```
Audio -> Whisper -> [Chinese variant] -> [Post-process LLM] -> [Translate LLM] -> Paste
```

Вставляется **только перевод**, оригинал сохраняется в историю.

### Настройки

| Поле | Файл | Описание |
|------|------|----------|
| `translation_enabled` | [settings.rs](file:///d:/dev/Handy/src-tauri/src/settings.rs) | Включение/выключение перевода |
| `translation_target_language` | [settings.rs](file:///d:/dev/Handy/src-tauri/src/settings.rs) | Целевой язык перевода |

### Файлы

| Файл | Что |
|------|-----|
| [settings.rs](file:///d:/dev/Handy/src-tauri/src/settings.rs) | Поля `translation_enabled`, `translation_target_language` в `AppSettings` |
| [actions.rs](file:///d:/dev/Handy/src-tauri/src/actions.rs) | `translate_transcription()`, интеграция в `process_transcription_output()` |
| [history.rs](file:///d:/dev/Handy/src-tauri/src/managers/history.rs) | Миграции БД (`translated_text`, `translation_target_language`), расширение `HistoryEntry`, `save_entry()` |
| [TranslationSettings.tsx](file:///d:/dev/Handy/src/components/settings/TranslationSettings.tsx) | UI: тоггл + dropdown выбора языка |
| [PostProcessingSettings.tsx](file:///d:/dev/Handy/src/components/settings/post-processing/PostProcessingSettings.tsx) | Монтирование `TranslationSettings` |

### Архитектурные решения

- Переиспользуется LLM-инфраструктура пост-обработки (провайдер, ключ, модель)
- Одно поле `translation_target_language` — общее для обеих функций перевода

---

## 2. Перевод выделенного текста (Ctrl+Space)

Один шорткат — два режима:
- **Текст выделен** → перевод на `translation_target_language`
- **Текст не выделен** → запись голоса (стандартное поведение)

### Принцип работы

При нажатии Ctrl+Space, `TranscribeAction::start()`:

1. Проверяет `translation_enabled && !translation_target_language.is_empty()`
2. Если да — вызывает `try_get_selected_text()` (симулирует Ctrl+C, читает clipboard)
3. Если текст получен — делегирует в `start_translate_selected_text()` (async перевод → paste)
4. Если нет — обычная запись голоса

### Файлы

| Файл | Что |
|------|-----|
| [input.rs](file:///d:/dev/Handy/src-tauri/src/input.rs) | `send_copy_ctrl_c()` — симуляция Ctrl+C через enigo |
| [clipboard.rs](file:///d:/dev/Handy/src-tauri/src/clipboard.rs) | `try_get_selected_text()` — получение выделенного текста через clipboard |
| [actions.rs](file:///d:/dev/Handy/src-tauri/src/actions.rs) | `start_translate_selected_text()` + ветвление в `TranscribeAction::start()` |
| [overlay.rs](file:///d:/dev/Handy/src-tauri/src/overlay.rs) | `show_translating_overlay()` — overlay-стейт "translating" |
| [RecordingOverlay.tsx](file:///d:/dev/Handy/src/overlay/RecordingOverlay.tsx) | Рендер стейта "translating" |
| [translation.json](file:///d:/dev/Handy/src/i18n/locales/en/translation.json) | Ключ `overlay.translating` |

### Условия работы

- `translation_enabled = true`
- `translation_target_language` не пуст
- Настроен LLM-провайдер (post-processing)

Если условия не выполнены — Ctrl+Space всегда записывает голос.

---

## Что не реализовано

- i18n для других языков (кроме EN) — ключи `settings.postProcessing.translation.*` и `overlay.translating`
- Предупреждение при одновременном `translate_to_english` + `translation_enabled`
- Отображение перевода в UI истории

---

## Инструкция по сборке (Windows)

Для компиляции установочного файла (`.msi` / `.exe`) обязательна установка **Rust на хост-системе**. Создание изолированных окружений (Docker/WSL) для сборки Tauri под Windows не рекомендуется (требуется прямой доступ к Windows SDK и MSVC).

### Шаг 1: Подготовка окружения (Зависимости)
Приложению требуются современные C++ компиляторы (для ONNX Runtime и Whisper) и системные утилиты. Без них вы получите фатальные ошибки при линковке (например, `LNK2019: __std_min_element_d`).

1. Установите [Chocolatey](https://chocolatey.org/install), затем выполните в PowerShell **от имени администратора**:
   ```powershell
   choco install cmake llvm visualstudio2022-workload-vctools -y
   ```
   *(Это установит CMake, LLVM/Clang и новейший набор MSVC 2022 Build Tools)*
2. Установите **Rust**: скачайте и запустите [rustup-init.exe](https://rustup.rs/) (обязательно перезагрузите терминал после установки).
3. Установите свежую **Node.js LTS** (она нужна для пакетных менеджеров npm/bun).

### Шаг 2: Установка Bun и зависимостей проекта
```powershell
npm install -g bun
bun install
```
*(Если при `bun install` возникает ошибка с `check-nix-deps.ts`, используйте `bun install --ignore-scripts`)*

### Шаг 3: Настройка подписи кода
По умолчанию в `src-tauri/tauri.conf.json` включена онлайн-подпись `Azure Trusted Signing`. 
Если у вас нет доступа к сертификату организации `cjpais-dev`, сборка **упадет в самом конце**.
**Для локальной сборки — отключите ее**:
Найдите блок `"windows": { "signCommand": ... }` в файле `tauri.conf.json` и **удалите или закомментируйте строку `signCommand`**.

### Шаг 4: Запуск сборки
```powershell
bun run tauri build
```
> [!WARNING]
> Важно: `bun run tauri build` собирает бэкенд на Rust (включая C++ исходники whisper.cpp) в Release-режиме с максимальной оптимизацией и генерирует `.msi`/`.exe` инсталляторы (NSIS). Этот процесс **занимает от 5 до 15 минут** с высокой нагрузкой на CPU. Это не зависание — просто дождитесь завершения команды.

4. Установочные файлы появятся в:
   - `src-tauri/target/release/bundle/msi/`
   - `src-tauri/target/release/bundle/nsis/`

---

## 3. Генерация TypeScript-типов (Bindings)
Если в Rust-бэкенде добавляются новые поля в структуру `AppSettings` (или другие типы) в файле `settings.rs`, то TS-типы перегенерируются автоматически благодаря библиотеке **Specta / tauri-specta**.
Файл `src/bindings.ts` содержит эти сгенерированные типы. Если после добавления полей (как `translation_enabled`) сборка фронтента (`tsc / bun run build`) падает с ошибкой, что таких свойств нет — это значит, что автоматическая кодогенерация `tauri-specta` ещё не отработала. Типы в `bindings.ts` можно обновить либо вызовом соответствующих макросов/тестов (в зависимости от настроек `tauri-specta` проекта), либо временно прописать вручную.
