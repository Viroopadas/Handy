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
3. Если да — вызывает `try_get_selected_text()` (симулирует Ctrl+C, читает clipboard).
4. Если текст получен — делегирует в `start_process_selected_text()` (async LLM → async перевод → paste). Оверлеи меняются последовательно: сначала `processing`, затем `translating`.
5. Если текста нет (или оба фильтра выключены) — запускается запись голоса. Если результат после пайплайна пуст — текст не вставляется, оверлеи просто скрываются.

### Файлы

| Файл | Что |
|------|-----|
| `input.rs` | `send_copy_ctrl_c()` — симуляция Ctrl+C через enigo |
| `clipboard.rs` | `try_get_selected_text()` — получение выделенного текста через clipboard |
| `actions.rs` | `start_process_selected_text()` + ветвление в `TranscribeAction::start()` |
| `overlay.rs` | `show_translating_overlay()`, `show_processing_overlay()` — UI стейты |
| `RecordingOverlay.tsx` | Рендер стейта "translating" и "processing" |
| `translation.json` | Ключ `overlay.translating` |

### Условия работы (для захвата текста)

- Нажата комбинация с `post_process == true`.
- Включен хотя бы один из фильтров: `post_process_enabled` или `translation_enabled`.
- В буфере обмена оказался новый текст после симуляции `Ctrl+C`.

Если условия не выполнены — запускается микрофон и запись голоса.

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
