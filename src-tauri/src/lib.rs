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

            // Locate oxford_words.json
            let mut data_path = PathBuf::from("data/oxford_words.json");
            if !data_path.exists() {
                if let Ok(res_path) = app.path().resource_dir() {
                    let p = res_path.join("data/oxford_words.json");
                    if p.exists() {
                        data_path = p;
                    }
                }
            }
            if !data_path.exists() {
                // Check relative to current studio workspace
                let fallback = PathBuf::from("/teamspace/studios/this_studio/zad-english/data/oxford_words.json");
                if fallback.exists() {
                    data_path = fallback;
                }
            }

            let data_loader = match DataLoader::load_from_path(data_path.clone()) {
                Ok(dl) => dl,
                Err(e) => {
                    log::error!("Failed to load oxford_words.json from {:?}: {}", data_path, e);
                    DataLoader::load_from_path(PathBuf::from("/teamspace/studios/this_studio/zad-english/data/oxford_words.json"))
                        .unwrap_or_else(|_| panic!("oxford_words.json could not be loaded"))
                }
            };

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
