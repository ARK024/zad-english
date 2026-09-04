use crate::config::ConfigStore;
use crate::data_loader::DataLoader;
use crate::windows;
use crate::AppContext;
use parking_lot::Mutex;
use std::sync::Arc;
use tauri::{
    menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

const ID_SHOW_WORD: &str = "tray.show_word";
const ID_SHOW_QUIZ: &str = "tray.show_quiz";
const ID_NEXT_WORD: &str = "tray.next_word";
const ID_PREV_WORD: &str = "tray.prev_word";
const ID_SETTINGS: &str = "tray.settings";
const ID_QUIT: &str = "tray.quit";

#[derive(Clone, Default)]
pub struct TrayState {
    pub tray_icon: Arc<Mutex<Option<TrayIcon<tauri::Wry>>>>,
}

impl TrayState {
    pub fn new() -> Self {
        Self::default()
    }
}

pub fn build_menu(
    app: &AppHandle,
    store: &ConfigStore,
    data: &DataLoader,
) -> tauri::Result<Menu<tauri::Wry>> {
    let cfg = store.get();
    let words = data.words_for_level(&cfg.current_level);
    let total = words.len().max(1);
    let idx = (cfg.current_index % total) + 1;

    let title = format!("زاد الإنجليزية [{} — {}/{}]", cfg.current_level, idx, total);
    let header = MenuItem::with_id(app, "tray.header", title, false, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;

    let show_word = MenuItem::with_id(app, ID_SHOW_WORD, "📖 عرض الكلمة الحالية", true, None::<&str>)?;
    let show_quiz = MenuItem::with_id(app, ID_SHOW_QUIZ, "🎯 اختبار سريع", true, None::<&str>)?;
    let next_word = MenuItem::with_id(app, ID_NEXT_WORD, "⏭ الكلمة التالية", true, None::<&str>)?;
    let prev_word = MenuItem::with_id(app, ID_PREV_WORD, "⏮ الكلمة السابقة", true, None::<&str>)?;
    let sep2 = PredefinedMenuItem::separator(app)?;

    let settings = MenuItem::with_id(app, ID_SETTINGS, "⚙️ الإعدادات والمعجم الشامل", true, None::<&str>)?;
    let sep3 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, ID_QUIT, "❌ خروج نهائي", true, None::<&str>)?;

    Menu::with_items(
        app,
        &[
            &header, &sep1, &show_word, &show_quiz, &next_word, &prev_word, &sep2, &settings,
            &sep3, &quit,
        ],
    )
}

pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let store: tauri::State<ConfigStore> = app.state();
    let data: tauri::State<DataLoader> = app.state();

    let menu = build_menu(app, &store, &data)?;

    let icon = app.default_window_icon().cloned().unwrap();
    let tray = TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .tooltip("زاد الإنجليزية - رفيقك لحفظ مفردات أكسفورد")
        .show_menu_on_left_click(false)
        .on_menu_event(move |app_handle, event: MenuEvent| {
            let store: tauri::State<ConfigStore> = app_handle.state();
            let data: tauri::State<DataLoader> = app_handle.state();
            let ctx: tauri::State<AppContext> = app_handle.state();

            match event.id.as_ref() {
                ID_SHOW_WORD => {
                    windows::show_widget(app_handle, &store, &data, &ctx.window_guard, None);
                }
                ID_SHOW_QUIZ => {
                    windows::show_quiz_window(app_handle, &store, &data, &ctx.window_guard);
                }
                ID_NEXT_WORD => {
                    let total = data.words_for_level(&store.get().current_level).len().max(1);
                    store.update(|c| {
                        c.current_index = (c.current_index + 1) % total;
                    });
                    windows::show_widget(app_handle, &store, &data, &ctx.window_guard, None);
                }
                ID_PREV_WORD => {
                    let total = data.words_for_level(&store.get().current_level).len().max(1);
                    store.update(|c| {
                        if c.current_index == 0 {
                            c.current_index = total - 1;
                        } else {
                            c.current_index -= 1;
                        }
                    });
                    windows::show_widget(app_handle, &store, &data, &ctx.window_guard, None);
                }
                ID_SETTINGS => {
                    windows::show_settings_window(app_handle);
                }
                ID_QUIT => {
                    app_handle.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                let store: tauri::State<ConfigStore> = app.state();
                let data: tauri::State<DataLoader> = app.state();
                let ctx: tauri::State<AppContext> = app.state();
                windows::show_widget(app, &store, &data, &ctx.window_guard, None);
            }
        })
        .build(app)?;

    let state: tauri::State<TrayState> = app.state();
    *state.tray_icon.lock() = Some(tray);

    Ok(())
}
