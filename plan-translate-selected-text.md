# План: Ctrl+Alt+Space — перевод выделенного текста

## Контекст

### Текущие шорткаты (не трогаем):
- **Ctrl+Space** — диктовка → русский текст (без LLM, без перевода)
- **Ctrl+Shift+Space** — диктовка → перевод через Google Translate на выбранный язык

### Новый шорткат:
- **Ctrl+Alt+Space** — захватить выделенный текст → перевести через Google Translate → вставить вместо выделения. **Никогда не включает запись голоса.**

---

## Изменения в Ctrl+Shift+Space

Убрать из `TranscribeAction::start()` логику захвата выделенного текста (строки 571-591 в `actions.rs`).
Ctrl+Shift+Space **всегда** будет только записывать голос → транскрибировать → переводить.

---

## Пошаговый план реализации

### Шаг 1. Бэкенд: Новая структура `TranslateSelectionAction` (actions.rs)

Создать новый `ShortcutAction`:

```rust
struct TranslateSelectionAction;

impl ShortcutAction for TranslateSelectionAction {
    fn start(&self, app: &AppHandle, _binding_id: &str, _shortcut_str: &str) {
        // 1. try_get_selected_text(app) — polling clipboard
        // 2. Если текст есть → start_process_selected_text(app, text)
        // 3. Если текста нет → play_feedback_sound(Stop), ничего не делать
        // НИКОГДА не включать запись голоса
    }
    
    fn stop(&self, ...) {
        // Пустой — это one-shot action, не toggle
    }
}
```

### Шаг 2. Бэкенд: Зарегистрировать в ACTION_MAP (actions.rs)

В `ACTION_MAP` (строка ~898) добавить:

```rust
map.insert(
    "translate_selection".to_string(),
    Arc::new(TranslateSelectionAction) as Arc<dyn ShortcutAction>,
);
```

### Шаг 3. Бэкенд: Добавить дефолтный шорткат (settings.rs)

В функцию `get_default_settings()` (после `transcribe_with_post_process`, ~строка 732) добавить:

```rust
bindings.insert(
    "translate_selection".to_string(),
    ShortcutBinding {
        id: "translate_selection".to_string(),
        name: "Translate Selection".to_string(),
        description: "Translates the currently selected text using Google Translate.".to_string(),
        default_binding: "ctrl+alt+space".to_string(),  // Windows/Linux
        current_binding: "ctrl+alt+space".to_string(),
    },
);
```

### Шаг 4. Бэкенд: handler.rs — маршрутизация

Новый шорткат **НЕ** является transcribe binding, поэтому `is_transcribe_binding()` его НЕ включает — это правильно. Он пойдёт по ветке «remaining bindings» (строка 64-68 handler.rs) и вызовет `action.start()` при нажатии.

⚠️ **Проверить:** handler.rs вызывает `start` на press и `stop` на release. Для нового action это нормально — `stop()` пустой.

### Шаг 5. Бэкенд: Убрать логику захвата текста из TranscribeAction::start()

В `actions.rs`, строки 571-591: удалить блок `if self.post_process { ... try_get_selected_text ... }`.

`TranscribeAction::start()` станет всегда начинать с загрузки модели и записи голоса, независимо от `post_process`.

### Шаг 6. Бэкенд: transcription_coordinator.rs

`is_transcribe_binding()` — **оставить как есть**. Новый шорткат `translate_selection` НЕ проходит через координатор (он не записывает аудио, не нуждается в debounce/state machine).

### Шаг 7. Бэкенд: tauri_impl.rs — пропуск при отключённом переводе

В `init_shortcuts()` (строка 22-39) **не нужен** специальный skip для `translate_selection` — шорткат должен регистрироваться всегда (перевод включается/выключается через toggle, но шорткат доступен).

Или, по аналогии с `transcribe_with_post_process`, можно скипнуть если `!translation_enabled`. Решение: **регистрировать всегда**, а проверку `translation_enabled` делать внутри `TranslateSelectionAction::start()`.

### Шаг 8. Фронтенд: UI для нового шортката

В компоненте `TranslationSettings.tsx` (или `PostProcessingSettings.tsx`) добавить `ShortcutInput` для редактирования комбинации:

```tsx
<ShortcutInput
  shortcutId="translate_selection"
  label="Translate Selection"
/>
```

Это позволит пользователю переназначить Ctrl+Alt+Space на другую комбинацию.

---

## Итоговая архитектура шорткатов

```
Ctrl+Space              → TranscribeAction { post_process: false }
                          → запись → Whisper → вставка (русский текст)

Ctrl+Shift+Space        → TranscribeAction { post_process: true }
                          → запись → Whisper → LLM постобработка → перевод → вставка

Ctrl+Alt+Space          → TranslateSelectionAction
                          → захват выделенного текста → Google Translate → вставка
                          → если текста нет — звук ошибки, запись НЕ включается
```

---

## Файлы, которые будут изменены

| Файл | Изменение |
|------|-----------|
| `actions.rs` | +`TranslateSelectionAction`, удаление блока selected text из `TranscribeAction::start()`, регистрация в `ACTION_MAP` |
| `settings.rs` | +дефолтный binding `translate_selection` |
| `TranslationSettings.tsx` | +`ShortcutInput` для настройки комбинации |

## Файлы, которые НЕ меняются

| Файл | Почему |
|------|--------|
| `handler.rs` | Новый шорткат корректно обрабатывается существующей логикой (не transcribe → simple start/stop) |
| `transcription_coordinator.rs` | Новый шорткат не использует координатор |
| `clipboard.rs` | Без изменений, переиспользуется `try_get_selected_text()` |
| `google_translate.rs` | Без изменений, переиспользуется через `translate_transcription()` |
