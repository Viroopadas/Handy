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

## 2. Обработка выделенного текста (Ctrl+Shift+Space)

Для шортката `transcribe_with_post_process` реализовано два режима:
- **Текст выделен** → текст прогоняется через каскад (LLM Post-Processing → Translation) и вставляется заменяя выделение.
- **Текст не выделен** → стандартная запись голоса (с последующим каскадом, как описано в разделе 1).

*Примечание: Шорткат `transcribe` (Ctrl+Space) никогда не захватывает выделенный текст и всегда записывает голос.*

### Принцип работы

При нажатии Ctrl+Shift+Space, `TranscribeAction::start()`:

1. Проверяет `self.post_process == true`.
2. Проверяет, включен ли хотя бы один фильтр (`post_process_enabled` или `translation_enabled`).
3. Если да — вызывает `try_get_selected_text()` (симулирует Ctrl+C, ждёт ответ через polling clipboard до 500ms).
4. Если текст получен — делегирует в `start_process_selected_text()` (async LLM → async перевод → сохранение в историю → paste). Оверлеи меняются последовательно: сначала `processing`, затем `translating`. Если результат не отличается от исходного текста — paste пропускается (при ошибке воспроизводится звуковой сигнал).
5. Если текста нет (или оба фильтра выключены) — запускается запись голоса. Если результат после пайплайна пуст — текст не вставляется, оверлеи просто скрываются.

### Файлы

| Файл | Что |
|------|-----|
| `input.rs` | `send_copy_ctrl_c()` — симуляция Ctrl+C через enigo |
| `clipboard.rs` | `try_get_selected_text()` — получение выделенного текста (polling clipboard каждые 50ms, до 500ms) |
| `actions.rs` | `start_process_selected_text()` + ветвление в `TranscribeAction::start()` |
| `overlay.rs` | `show_translating_overlay()`, `show_processing_overlay()` — UI стейты |
| `RecordingOverlay.tsx` | Рендер стейта "translating" и "processing" |
| `translation.json` | Ключ `overlay.translating` |
| `google_translate.rs` | Google Translate API (POST, form-encoded) |

### Условия работы (для захвата текста)

- Нажата комбинация с `post_process == true`.
- Включен хотя бы один из фильтров: `post_process_enabled` или `translation_enabled`.
- В буфере обмена оказался новый текст после симуляции `Ctrl+C` (определяется через polling, макс. 500ms).

Если условия не выполнены — запускается микрофон и запись голоса.

### Поведение после обработки

- Если результат **отличается** от исходного текста — вставляется через paste.
- Если результат **совпадает** с исходным (ошибка API / оба фильтра ничего не изменили) — paste пропускается, при ошибке воспроизводится звуковой сигнал.
- Результат **всегда сохраняется в историю** (`HistoryManager::save_entry`) — с пустым `file_name` (нет WAV).

---

## Известные ловушки и архитектурные нюансы

### Алгоритм принятия решений (Ctrl+Shift+Space)

```
1. Если self.post_process == true:
2.   has_pipeline = post_process_enabled || (translation_enabled && !target_language.is_empty())
3.   Если has_pipeline == true:
4.     Попытаться получить выделенный текст (try_get_selected_text, polling до 500ms)
5.     Если текст получен → запустить каскадный пайплайн
6.     Если текст НЕ получен → перейти к записи голоса
7.   Если has_pipeline == false:
8.     Сразу перейти к записи голоса (без попытки получить текст!)
```

### Ctrl+C в терминале = SIGINT, а не копирование

`try_get_selected_text()` симулирует нажатие `Ctrl+C` через `input.rs` → `send_copy_ctrl_c()` (enigo).
В терминалах (cmd.exe, PowerShell) `Ctrl+C` интерпретируется как **прерывание процесса**, а не как копирование. Если при тестировании активное окно — терминал, clipboard останется пуст, и программа перейдёт к записи голоса вместо обработки текста.

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
