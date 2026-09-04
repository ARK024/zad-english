use parking_lot::Mutex;
use serde_json::Value;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Manager};

mod config;
mod data_loader;
mod ipc;
mod orchestrator;
mod tray;
mod windows;

use crate::config::ConfigStore;
use crate::data_loader::DataLoader;
use crate::orchestrator::{Orchestrator, TickAction};
use crate::tray::TrayState;
use crate::windows::WindowGuard;

#[derive(Clone)]
pub struct AppContext {
    pub window_guard: WindowGuard,
    pub orchestrator: Orchestrator,
    pub pending_widget_payload: Arc<Mutex<Option<Value>>>,
    pub pending_quiz_payload: Arc<Mutex<Option<Value>>>,
}

impl AppContext {
    pub fn new() -> Self {
        Self {
            window_guard: WindowGuard::new(),
            orchestrator: Orchestrator::new(),
            pending_widget_payload: Arc::new(Mutex::new(None)),
            pending_quiz_payload: Arc::new(Mutex::new(None)),
        }
    }

    pub fn restart_orchestrator(&self, app: &AppHandle) {
        let store: tauri::State<ConfigStore> = app.state();
        let app_for_tick = app.clone();
        let me = self.clone();

        self.orchestrator.start(store.inner().clone(), move |action| {
            on_tick(&app_for_tick, &me, action);
        });
    }
}

fn on_tick(app: &AppHandle, ctx: &AppContext, action: TickAction) {
    let store: tauri::State<ConfigStore> = app.state();
    let data: tauri::State<DataLoader> = app.state();

    match action {
        TickAction::ShowWord => {
            let total = data.words_for_level(&store.get().current_level).len().max(1);
            store.update(|c| {
                c.current_index = (c.current_index + 1) % total;
            });
            windows::show_widget(app, &store, &data, &ctx.window_guard, None);
        }
        TickAction::ShowQuiz => {
            windows::show_quiz_window(app, &store, &data, &ctx.window_guard);
        }
    }
}

pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();
    log::info!("Starting Zad English application...");

    std::panic::set_hook(Box::new(|info| {
        log::error!("CRITICAL PANIC: {}", info);
        eprintln!("CRITICAL PANIC: {}", info);
        let temp_log = std::env::temp_dir().join("zad-english-crash.log");
        let _ = std::fs::write(&temp_log, format!("PANIC: {}\n", info));
    }));

    let app_context = AppContext::new();
    let tray_state = TrayState::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            log::info!("Another instance launched; focusing existing widget");
            if let Some(w) = app.get_webview_window(windows::WIDGET_LABEL) {
                let _ = w.show();
                let _ = w.set_focus();
            } else {
                let store: tauri::State<ConfigStore> = app.state();
                let data: tauri::State<DataLoader> = app.state();
                let ctx: tauri::State<AppContext> = app.state();
                windows::show_widget(app, &store, &data, &ctx.window_guard, None);
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(move |app| {
            let app_handle = app.handle();

            // Locate config directory
            let config_dir = app
                .path()
                .app_config_dir()
                .unwrap_or_else(|_| PathBuf::from("."));
            let store = ConfigStore::load_or_default(config_dir);

            // Load Oxford words (tries local files, resources, app data, then embedded fallback)
            let data_loader = DataLoader::load_or_default(app_handle);

            app.manage(store);
            app.manage(data_loader);
            app.manage(app_context.clone());
            app.manage(tray_state);

            // Setup tray icon
            if let Err(e) = tray::setup_tray(app_handle) {
                log::error!("Failed to setup tray: {}", e);
            }

            // Start orchestrator background loop
            app_context.restart_orchestrator(app_handle);

            // Show initial word widget on launch
            let store_state: tauri::State<ConfigStore> = app.state();
            let data_state: tauri::State<DataLoader> = app.state();
            windows::show_widget(app_handle, &store_state, &data_state, &app_context.window_guard, None);

            log::info!("Zad English started successfully!");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ipc::widget_ready,
            ipc::w_hide,
            ipc::w_next,
            ipc::w_prev,
            ipc::w_memorized,
            ipc::w_review,
            ipc::w_open_quiz,
            ipc::quiz_ready,
            ipc::q_answer,
            ipc::q_next,
            ipc::q_hide,
            ipc::s_get_config,
            ipc::s_save_config,
            ipc::s_search_words,
            ipc::s_get_words_for_level,
            ipc::s_show_specific_word,
            ipc::s_reset_progress,
            ipc::s_open_settings,
            ipc::get_offline_audio,
            ipc::get_audio_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Zad English application");
}
