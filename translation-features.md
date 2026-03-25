# LLM Translation Features

Документ-справка для двух реализованных функций перевода.

---

## 1. Перевод транскрипции (Каскад)

Автоматический перевод транскрибированного текста через LLM после пост-обработки. 
**Внимание:** Выполняется **только** при использовании шортката `transcribe_with_post_process` (по умолчанию `Ctrl+Shift+Space`). 
Обычный шорткат `transcribe` (`Ctrl+Space`) всегда вставляет исходную транскрипцию без LLM и перевода.

### Пайплайн при записи голоса

```
Audio -> Whisper -> [Chinese variant] -> [Post-process LLM] -> [Translate LLM] -> Paste
```

Вставляется **только финал (перевод)**, оригинальная транскрипция сохраняется в историю.

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

## 2. Перевод выделенного текста (Ctrl+Alt+Space)

Отдельный шорткат `translate_selection` — **one-shot action** (не toggle). Захватывает выделенный текст и переводит через настроенный сервис перевода. **Никогда не включает запись голоса.**

### Пайплайн

```
Ctrl+Alt+Space → try_get_selected_text() → [LLM Post-Processing] → [Translation] → Paste
```

Если текст не выделен или перевод отключён — воспроизводится звук ошибки (SoundType::Stop), ничего не происходит.

### Принцип работы

При нажатии Ctrl+Alt+Space, `TranslateSelectionAction::start()`:

1. Проверяет `translation_enabled == true` и `translation_target_language` не пуст.
2. Если перевод выключен — play_feedback_sound(Stop), return.
3. Вызывает `try_get_selected_text(app)` (симулирует Ctrl+C, polling clipboard до 500ms).
4. Если текст получен — делегирует в `start_process_selected_text(app, text)`.
5. Если текста нет — play_feedback_sound(Stop).

> **Важно:** `stop()` у `TranslateSelectionAction` — пустой. Шорткат не проходит через `TranscriptionCoordinator` (не записывает аудио), поэтому обрабатывается через ветку "remaining bindings" в `handler.rs`.

### Файлы

| Файл | Что |
|------|-----|
| [actions.rs](file:///d:/dev/Handy/src-tauri/src/actions.rs) | `TranslateSelectionAction` + регистрация в `ACTION_MAP` |
| [settings.rs](file:///d:/dev/Handy/src-tauri/src/settings.rs) | Дефолтный binding `translate_selection` (ctrl+alt+space) |
| [TranslationSettings.tsx](file:///d:/dev/Handy/src/components/settings/TranslationSettings.tsx) | `ShortcutInput` для настройки комбинации |
| `input.rs` | `send_copy_ctrl_c()` — симуляция Ctrl+C через enigo |
| `clipboard.rs` | `try_get_selected_text()` — polling clipboard каждые 50ms, до 500ms |
| `overlay.rs` | `show_translating_overlay()`, `show_processing_overlay()` — UI стейты |
| `RecordingOverlay.tsx` | Рендер стейта "translating" и "processing" |
| `google_translate.rs` | Google Translate API (POST, form-encoded) |

### Изменение: Ctrl+Shift+Space больше НЕ захватывает текст

Ранее `TranscribeAction::start()` при `post_process == true` пытался получить выделенный текст. Теперь эта логика перенесена в `TranslateSelectionAction`. `Ctrl+Shift+Space` **всегда** записывает голос → транскрибирует → обрабатывает через LLM → переводит.

---

## Итоговая архитектура шорткатов

```
Ctrl+Space              → TranscribeAction { post_process: false }
                          → запись → Whisper → вставка (русский текст)

Ctrl+Shift+Space        → TranscribeAction { post_process: true }
                          → запись → Whisper → LLM постобработка → перевод → вставка

Ctrl+Alt+Space          → TranslateSelectionAction
                          → захват выделенного текста → каскад (LLM + перевод) → вставка
                          → если текста нет — звук ошибки, запись НЕ включается
```

---

## Известные ловушки и архитектурные нюансы

### Ctrl+C в терминале = SIGINT, а не копирование

`try_get_selected_text()` симулирует нажатие `Ctrl+C` через `input.rs` → `send_copy_ctrl_c()` (enigo).
В терминалах (cmd.exe, PowerShell) `Ctrl+C` интерпретируется как **прерывание процесса**, а не как копирование. Если при тестировании активное окно — терминал, clipboard останется пуст, и программа воспроизведёт звук ошибки.

### Настройки перевода и optimistic UI

Настройки `translation_enabled`, `translation_service`, `translation_target_language` персистятся через Tauri-команды:
- `change_translation_enabled_setting`
- `change_translation_service_setting`
- `change_translation_target_language_setting`

Они зарегистрированы в `collect_commands!` ([lib.rs:365-367](file:///d:/dev/Handy/src-tauri/src/lib.rs#L365-L367)) и привязаны к фронтенду через `settingUpdaters` в [settingsStore.ts](file:///d:/dev/Handy/src/stores/settingsStore.ts).

> **Важно:** Если добавляются новые настройки — обязательно реализовать Tauri-команду для сохранения, иначе optimistic UI будет показывать включённое состояние, но при рефреше стейта с бэкенда всё сбросится к дефолтам.

---

## Что не реализовано

- i18n для других языков (кроме EN) — ключи `settings.postProcessing.translation.*` и `overlay.translating`
- Предупреждение при одновременном `translate_to_english` + `translation_enabled`
- Отображение перевода в UI истории (записи сохраняются в БД, но фронтенд пока не отображает `translated_text`)
- Toast/notification при ошибках перевода (сейчас только звуковой сигнал)

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

### Шаг 4: Запуск сборки (легкая установка)
```powershell
bun run tauri build --bundles msi
```
> [!WARNING]
> Важно: `bun run tauri build --bundles msi` собирает бэкенд на Rust (включая C++ исходники whisper.cpp) в Release-режиме с максимальной оптимизацией и генерирует **только** `.msi` установщик (пропуская долгую сборку .exe/NSIS инсталлятора). Этот процесс **занимает от 5 до 15 минут** с высокой нагрузкой на CPU. Это не зависание — просто дождитесь завершения команды.

4. Установочный файл `.msi` появится в:
   - `src-tauri/target/release/bundle/msi/`

---

## 3. Генерация TypeScript-типов (Bindings)
Если в Rust-бэкенде добавляются новые поля в структуру `AppSettings` (или другие типы) в файле `settings.rs`, то TS-типы перегенерируются автоматически благодаря библиотеке **Specta / tauri-specta**.
Файл `src/bindings.ts` содержит эти сгенерированные типы. Если после добавления полей (как `translation_enabled`) сборка фронтента (`tsc / bun run build`) падает с ошибкой, что таких свойств нет — это значит, что автоматическая кодогенерация `tauri-specta` ещё не отработала. Типы в `bindings.ts` можно обновить либо вызовом соответствующих макросов/тестов (в зависимости от настроек `tauri-specta` проекта), либо временно прописать вручную.
