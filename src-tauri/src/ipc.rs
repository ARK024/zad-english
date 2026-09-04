use crate::config::{AppConfig, ConfigStore};
use crate::data_loader::{DataLoader, QuizQuestion, WordItem};
use crate::windows;
use crate::AppContext;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_autostart::ManagerExt;

// ── Widget Commands ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn widget_ready(app: AppHandle, ctx: State<'_, AppContext>, store: State<'_, ConfigStore>, data: State<'_, DataLoader>) {
    if let Some(w) = app.get_webview_window(windows::WIDGET_LABEL) {
        let payload = ctx
            .pending_widget_payload
            .lock()
            .take()
            .or_else(|| windows::build_word_payload(&store, &data, None));

        if let Some(p) = payload {
            let _ = w.emit("word_data", p);
        }
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[tauri::command]
pub fn w_hide(app: AppHandle) {
    windows::destroy_widget(&app);
}

#[tauri::command]
pub fn w_next(
    app: AppHandle,
    store: State<'_, ConfigStore>,
    data: State<'_, DataLoader>,
    ctx: State<'_, AppContext>,
) {
    let cfg = store.get();
    let total = data.words_for_level(&cfg.current_level).len().max(1);
    let next_idx = (cfg.current_index + 1) % total;
    store.update(|c| {
        c.current_index = next_idx;
    });

    if let Some(payload) = windows::build_word_payload(&store, &data, Some(next_idx)) {
        if let Some(w) = app.get_webview_window(windows::WIDGET_LABEL) {
            let _ = w.emit("word_data", payload);
        } else {
            windows::show_widget(&app, &store, &data, &ctx.window_guard, Some(next_idx));
        }
    }
}

#[tauri::command]
pub fn w_prev(
    app: AppHandle,
    store: State<'_, ConfigStore>,
    data: State<'_, DataLoader>,
    ctx: State<'_, AppContext>,
) {
    let cfg = store.get();
    let total = data.words_for_level(&cfg.current_level).len().max(1);
    let prev_idx = if cfg.current_index == 0 {
        total - 1
    } else {
        cfg.current_index - 1
    };
    store.update(|c| {
        c.current_index = prev_idx;
    });

    if let Some(payload) = windows::build_word_payload(&store, &data, Some(prev_idx)) {
        if let Some(w) = app.get_webview_window(windows::WIDGET_LABEL) {
            let _ = w.emit("word_data", payload);
        } else {
            windows::show_widget(&app, &store, &data, &ctx.window_guard, Some(prev_idx));
        }
    }
}

#[tauri::command]
pub fn w_memorized(
    app: AppHandle,
    store: State<'_, ConfigStore>,
    data: State<'_, DataLoader>,
    id: u64,
) {
    store.mark_memorized(id);
    if let Some(payload) = windows::build_word_payload(&store, &data, None) {
        if let Some(w) = app.get_webview_window(windows::WIDGET_LABEL) {
            let _ = w.emit("word_data", payload);
        }
    }
}

#[tauri::command]
pub fn w_review(
    app: AppHandle,
    store: State<'_, ConfigStore>,
    data: State<'_, DataLoader>,
    id: u64,
) {
    store.mark_review(id);
    if let Some(payload) = windows::build_word_payload(&store, &data, None) {
        if let Some(w) = app.get_webview_window(windows::WIDGET_LABEL) {
            let _ = w.emit("word_data", payload);
        }
    }
}

#[tauri::command]
pub fn w_open_quiz(
    app: AppHandle,
    store: State<'_, ConfigStore>,
    data: State<'_, DataLoader>,
    ctx: State<'_, AppContext>,
) {
    windows::show_quiz_window(&app, &store, &data, &ctx.window_guard);
}

// ── Quiz Commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn quiz_ready(app: AppHandle, ctx: State<'_, AppContext>, store: State<'_, ConfigStore>, data: State<'_, DataLoader>) {
    if let Some(w) = app.get_webview_window(windows::QUIZ_LABEL) {
        let payload = ctx
            .pending_quiz_payload
            .lock()
            .take()
            .or_else(|| {
                let cfg = store.get();
                data.generate_quiz(Some(&cfg.current_level)).map(|q| {
                    serde_json::json!({
                        "question": q,
                        "config": {
                            "theme": cfg.theme,
                            "fontSize": cfg.font_size,
                            "opacity": cfg.opacity,
                            "soundVoice": cfg.sound_voice,
                        }
                    })
                })
            });

        if let Some(p) = payload {
            let _ = w.emit("quiz_data", p);
        }
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[tauri::command]
pub fn q_answer(
    store: State<'_, ConfigStore>,
    is_correct: bool,
    word_id: u64,
) {
    if is_correct {
        store.mark_memorized(word_id);
    } else {
        store.mark_review(word_id);
    }
}

#[tauri::command]
pub fn q_next(
    app: AppHandle,
    store: State<'_, ConfigStore>,
    data: State<'_, DataLoader>,
) -> Option<QuizQuestion> {
    let cfg = store.get();
    let q = data.generate_quiz(Some(&cfg.current_level))?;
    if let Some(w) = app.get_webview_window(windows::QUIZ_LABEL) {
        let _ = w.emit(
            "quiz_data",
            serde_json::json!({
                "question": q,
                "config": {
                    "theme": cfg.theme,
                    "fontSize": cfg.font_size,
                    "opacity": cfg.opacity,
                    "soundVoice": cfg.sound_voice,
                }
            }),
        );
    }
    Some(q)
}

#[tauri::command]
pub fn q_hide(app: AppHandle) {
    windows::destroy_quiz(&app);
}

// ── Settings & Search Commands ───────────────────────────────────────────────

#[tauri::command]
pub fn s_get_config(store: State<'_, ConfigStore>) -> AppConfig {
    store.get()
}

#[tauri::command]
pub fn s_save_config(
    app: AppHandle,
    store: State<'_, ConfigStore>,
    ctx: State<'_, AppContext>,
    payload: AppConfig,
) -> Result<(), String> {
    let old_autostart = store.get().auto_start;
    let new_autostart = payload.auto_start;

    store.update(|c| {
        *c = payload;
    });

    if old_autostart != new_autostart {
        let manager = app.autolaunch();
        let _ = if new_autostart {
            manager.enable()
        } else {
            manager.disable()
        };
    }

    ctx.restart_orchestrator(&app);
    Ok(())
}

#[tauri::command]
pub fn s_search_words(
    data: State<'_, DataLoader>,
    query: String,
    level: Option<String>,
) -> Vec<WordItem> {
    data.search(&query, level.as_deref())
}

#[tauri::command]
pub fn s_get_words_for_level(data: State<'_, DataLoader>, level: String) -> Vec<WordItem> {
    data.words_for_level(&level)
}

#[tauri::command]
pub fn s_show_specific_word(
    app: AppHandle,
    store: State<'_, ConfigStore>,
    data: State<'_, DataLoader>,
    ctx: State<'_, AppContext>,
    id: u64,
) {
    let list = data.words_for_level(&store.get().current_level);
    if let Some(pos) = list.iter().position(|w| w.id == id) {
        store.update(|c| {
            c.current_index = pos;
        });
        windows::show_widget(&app, &store, &data, &ctx.window_guard, Some(pos));
    }
}

#[tauri::command]
pub fn s_reset_progress(store: State<'_, ConfigStore>) -> AppConfig {
    store.update(|c| {
        c.memorized_ids.clear();
        c.review_ids.clear();
        c.current_index = 0;
    })
}

#[tauri::command]
pub fn s_open_settings(app: AppHandle) {
    windows::show_settings_window(&app);
}
