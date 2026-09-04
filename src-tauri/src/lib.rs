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

fn init_file_logger() {
    use std::io::Write;
    fn pick_log_path() -> std::path::PathBuf {
        let mut candidates: Vec<std::path::PathBuf> = Vec::new();
        if let Ok(exe) = std::env::current_exe() {
            if let Some(d) = exe.parent() {
                candidates.push(d.join("zad-english.log"));
            }
        }
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            candidates.push(
                std::path::PathBuf::from(local)
                    .join("Zad English")
                    .join("zad-english.log"),
            );
        }
        candidates.push(std::env::temp_dir().join("zad-english.log"));
        candidates.push(std::path::PathBuf::from("zad-english.log"));

        for c in &candidates {
            if let Some(parent) = c.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            if let Ok(mut f) = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(c)
            {
                let _ = writeln!(
                    f,
                    "[{}] Logger initialized: {}",
                    chrono::Local::now().format("%Y-%m-%d %H:%M:%S"),
                    c.display()
                );
                return c.clone();
            }
        }
        candidates.pop().unwrap()
    }
    let log_path = pick_log_path();

    struct FileLogger {
        path: std::path::PathBuf,
        writer: std::sync::Mutex<Option<std::io::BufWriter<std::fs::File>>>,
    }

    impl log::Log for FileLogger {
        fn enabled(&self, _: &log::Metadata) -> bool {
            true
        }
        fn log(&self, record: &log::Record) {
            use std::io::Write;
            let mut guard = self.writer.lock().unwrap_or_else(|e| e.into_inner());
            if guard.is_none() {
                if let Ok(f) = std::fs::OpenOptions::new().create(true).append(true).open(&self.path) {
                    *guard = Some(std::io::BufWriter::new(f));
                }
            }
            if let Some(ref mut w) = *guard {
                let msg = format!(
                    "[{}] {} {} - {}\n",
                    chrono::Local::now().format("%Y-%m-%d %H:%M:%S"),
                    record.level(),
                    record.target(),
                    record.args()
                );
                let _ = w.write_all(msg.as_bytes());
                let _ = w.flush();
            }
        }
        fn flush(&self) {
            if let Ok(mut guard) = self.writer.lock() {
                if let Some(ref mut w) = *guard {
                    let _ = std::io::Write::flush(w);
                }
            }
        }
    }

    let logger = FileLogger {
        path: log_path,
        writer: std::sync::Mutex::new(None),
    };
    let _ = log::set_boxed_logger(Box::new(logger)).map(|()| log::set_max_level(log::LevelFilter::Info));
}

#[cfg(windows)]
fn show_native_error_dialog(title: &str, message: &str) {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    let wide_title: Vec<u16> = OsStr::new(title).encode_wide().chain(Some(0)).collect();
    let wide_msg: Vec<u16> = OsStr::new(message).encode_wide().chain(Some(0)).collect();
    extern "system" {
        fn MessageBoxW(hwnd: isize, text: *const u16, caption: *const u16, utype: u32) -> i32;
    }
    unsafe {
        MessageBoxW(0, wide_msg.as_ptr(), wide_title.as_ptr(), 0x10 /* MB_ICONERROR */);
    }
}

#[cfg(not(windows))]
fn show_native_error_dialog(_title: &str, _message: &str) {}

pub fn run() {
    init_file_logger();
    let _ = env_logger::try_init();
    log::info!("=== Starting Zad English application ===");
    log::info!("exe: {:?}", std::env::current_exe());
    log::info!("cwd: {:?}", std::env::current_dir());

    std::panic::set_hook(Box::new(|info| {
        let err_str = format!("{}", info);
        log::error!("CRITICAL PANIC: {}", err_str);
        let temp_log = std::env::temp_dir().join("zad-english-crash.log");
        let _ = std::fs::write(&temp_log, format!("PANIC: {}\n", err_str));
        show_native_error_dialog("زاد الإنجليزية - تنبيه خطأ", &format!("حدث خطأ في تشغيل البرنامج:\n\n{}", err_str));
    }));

    let app_context = AppContext::new();
    let tray_state = TrayState::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            log::info!("Another instance launched; focusing existing window");
            windows::show_settings_window(app);
            if let Some(w) = app.get_webview_window(windows::WIDGET_LABEL) {
                let _ = w.show();
                let _ = w.set_focus();
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

            // Show main window on launch
            windows::show_settings_window(app_handle);

            // Show initial word widget on launch with a slight yield to let main window initialize
            let app_c = app_handle.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                let store_state: tauri::State<ConfigStore> = app_c.state();
                let data_state: tauri::State<DataLoader> = app_c.state();
                let ctx_state: tauri::State<AppContext> = app_c.state();
                windows::show_widget(&app_c, &store_state, &data_state, &ctx_state.window_guard, None);
            });

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
