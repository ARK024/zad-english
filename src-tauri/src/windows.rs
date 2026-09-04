use crate::config::{AppConfig, ConfigStore};
use crate::data_loader::DataLoader;
use crate::AppContext;
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{
    AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder,
    WindowEvent,
};

pub const WIDGET_LABEL: &str = "widget";
pub const QUIZ_LABEL: &str = "quiz";
pub const SETTINGS_LABEL: &str = "settings";

const WIDGET_DEFAULT_W: f64 = 440.0;
const WIDGET_DEFAULT_H: f64 = 460.0;
const QUIZ_DEFAULT_W: f64 = 440.0;
const QUIZ_DEFAULT_H: f64 = 420.0;

#[derive(Clone, Default)]
pub struct WindowGuard {
    busy: Arc<AtomicBool>,
}

impl WindowGuard {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn try_acquire(&self) -> bool {
        !self.busy.swap(true, Ordering::SeqCst)
    }
    pub fn release(&self) {
        self.busy.store(false, Ordering::SeqCst);
    }
}

pub fn compute_position(app: &AppHandle, cfg: &AppConfig, w: f64, h: f64) -> (f64, f64) {
    if let (Some(x), Some(y)) = (cfg.widget_x, cfg.widget_y) {
        if let Ok(monitors) = app.available_monitors() {
            for m in &monitors {
                let pos = m.position();
                let size = m.size();
                let scale = m.scale_factor();
                let mx = pos.x as f64 / scale;
                let my = pos.y as f64 / scale;
                let mw = size.width as f64 / scale;
                let mh = size.height as f64 / scale;
                if x >= mx && x + w <= mx + mw && y >= my && y + h <= my + mh {
                    return (x, y);
                }
            }
        }
    }

    if let Ok(Some(primary)) = app.primary_monitor() {
        let scale = primary.scale_factor();
        let size = primary.size();
        let sw = size.width as f64 / scale;
        let sh = size.height as f64 / scale;
        let margin = 20.0;

        match cfg.position.as_str() {
            "top-right" => (sw - w - margin, margin),
            "top-left" => (margin, margin),
            "bottom-left" => (margin, sh - h - margin),
            _ => (sw - w - margin, sh - h - margin), // default: bottom-right
        }
    } else {
        (50.0, 50.0)
    }
}

pub fn build_word_payload(
    store: &ConfigStore,
    data: &DataLoader,
    index_override: Option<usize>,
) -> Option<Value> {
    let cfg = store.get();
    let current_level = &cfg.current_level;
    let list = data.words_for_level(current_level);
    if list.is_empty() {
        return None;
    }

    let total = list.len();
    let idx = index_override.unwrap_or(cfg.current_index) % total;
    let word = &list[idx];

    let is_memorized = cfg.memorized_ids.contains(&word.id);
    let is_review = cfg.review_ids.contains(&word.id);

    Some(json!({
        "word": word,
        "index": idx,
        "total": total,
        "isMemorized": is_memorized,
        "isReview": is_review,
        "stats": {
            "memorizedCount": cfg.memorized_ids.len(),
            "reviewCount": cfg.review_ids.len(),
            "totalCount": data.total_count(),
            "level": current_level,
            "streakDays": cfg.streak_days,
        },
        "config": {
            "theme": cfg.theme,
            "fontSize": cfg.font_size,
            "opacity": cfg.opacity,
            "soundVoice": cfg.sound_voice,
            "soundRate": cfg.sound_rate,
            "autoPronounce": cfg.auto_pronounce,
            "displayDuration": cfg.display_duration_seconds,
            "autoHide": cfg.auto_hide,
        }
    }))
}

pub fn show_widget(
    app: &AppHandle,
    store: &ConfigStore,
    data: &DataLoader,
    guard: &WindowGuard,
    index_override: Option<usize>,
) {
    if !guard.try_acquire() {
        return;
    }

    let payload = match build_word_payload(store, data, index_override) {
        Some(p) => p,
        None => {
            guard.release();
            return;
        }
    };

    if let Some(existing) = app.get_webview_window(WIDGET_LABEL) {
        let _ = existing.emit("word_data", payload);
        let _ = existing.show();
        let _ = existing.set_focus();
        guard.release();
        return;
    }

    let cfg = store.get();
    let (x, y) = compute_position(app, &cfg, WIDGET_DEFAULT_W, WIDGET_DEFAULT_H);

    if let Some(ctx) = app.try_state::<AppContext>() {
        *ctx.pending_widget_payload.lock() = Some(payload);
    }

    let builder =
        WebviewWindowBuilder::new(app, WIDGET_LABEL, WebviewUrl::App("widget.html".into()))
            .title("زاد الإنجليزية")
            .inner_size(WIDGET_DEFAULT_W, WIDGET_DEFAULT_H)
            .position(x, y)
            .min_inner_size(360.0, 380.0)
            .max_inner_size(700.0, 750.0)
            .decorations(false)
            .transparent(false)
            .always_on_top(true)
            .resizable(true)
            .skip_taskbar(true)
            .visible(true);

    let window = match builder.build() {
        Ok(w) => w,
        Err(e) => {
            log::error!("Failed to create widget window: {}", e);
            guard.release();
            return;
        }
    };

    let w_clone = window.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(600)).await;
        let _ = w_clone.show();
    });

    let store_c = store.clone();
    let win_c = window.clone();
    window.on_window_event(move |event| match event {
        WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
            if let Ok(pos) = win_c.outer_position() {
                let scale = win_c.scale_factor().unwrap_or(1.0);
                store_c.update(|c| {
                    c.widget_x = Some(pos.x as f64 / scale);
                    c.widget_y = Some(pos.y as f64 / scale);
                });
            }
        }
        _ => {}
    });

    guard.release();
}

pub fn destroy_widget(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(WIDGET_LABEL) {
        let _ = w.destroy();
    }
}

pub fn show_quiz_window(
    app: &AppHandle,
    store: &ConfigStore,
    data: &DataLoader,
    guard: &WindowGuard,
) {
    if !guard.try_acquire() {
        return;
    }

    let cfg = store.get();
    let quiz_q = match data.generate_quiz(Some(&cfg.current_level)) {
        Some(q) => q,
        None => {
            guard.release();
            return;
        }
    };

    let payload = json!({
        "question": quiz_q,
        "config": {
            "theme": cfg.theme,
            "fontSize": cfg.font_size,
            "opacity": cfg.opacity,
            "soundVoice": cfg.sound_voice,
        }
    });

    if let Some(existing) = app.get_webview_window(QUIZ_LABEL) {
        let _ = existing.emit("quiz_data", payload);
        let _ = existing.show();
        let _ = existing.set_focus();
        guard.release();
        return;
    }

    let (x, y) = compute_position(app, &cfg, QUIZ_DEFAULT_W, QUIZ_DEFAULT_H);

    if let Some(ctx) = app.try_state::<AppContext>() {
        *ctx.pending_quiz_payload.lock() = Some(payload);
    }

    let builder = WebviewWindowBuilder::new(app, QUIZ_LABEL, WebviewUrl::App("quiz.html".into()))
        .title("اختبار سريع - زاد الإنجليزية")
        .inner_size(QUIZ_DEFAULT_W, QUIZ_DEFAULT_H)
        .position(x, y)
        .min_inner_size(360.0, 360.0)
        .max_inner_size(600.0, 600.0)
        .decorations(false)
        .transparent(false)
        .always_on_top(true)
        .resizable(true)
        .skip_taskbar(true)
        .visible(true);

    if let Ok(w) = builder.build() {
        let _ = w.show();
        let _ = w.set_focus();
    }
    guard.release();
}

pub fn destroy_quiz(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(QUIZ_LABEL) {
        let _ = w.destroy();
    }
}

pub fn show_settings_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(SETTINGS_LABEL) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        return;
    }

    let builder = WebviewWindowBuilder::new(
        app,
        SETTINGS_LABEL,
        WebviewUrl::App("settings.html".into()),
    )
    .title("زاد الإنجليزية — الإعدادات والمعجم الشامل")
    .inner_size(900.0, 680.0)
    .min_inner_size(650.0, 500.0)
    .center()
    .decorations(true)
    .resizable(true)
    .visible(true);

    if let Ok(w) = builder.build() {
        let _ = w.show();
        let _ = w.set_focus();
    }
}
