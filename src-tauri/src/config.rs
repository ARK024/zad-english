use chrono::Local;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub current_level: String,
    pub current_index: usize,
    pub memorized_ids: Vec<u64>,
    pub review_ids: Vec<u64>,
    pub interval_minutes: u64,
    pub display_duration_seconds: u64,
    pub auto_hide: bool,
    pub sound_voice: String,
    pub sound_rate: f32,
    pub auto_pronounce: bool,
    pub theme: String,
    pub font_size: u32,
    pub opacity: f32,
    pub position: String,
    pub widget_x: Option<f64>,
    pub widget_y: Option<f64>,
    pub quiz_frequency: u32,
    pub streak_days: u32,
    pub last_active_date: String,
    pub auto_start: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        let today = Local::now().format("%Y-%m-%d").to_string();
        Self {
            current_level: "All".to_string(),
            current_index: 0,
            memorized_ids: Vec::new(),
            review_ids: Vec::new(),
            interval_minutes: 15,
            display_duration_seconds: 30,
            auto_hide: true,
            sound_voice: "en-US".to_string(),
            sound_rate: 1.0,
            auto_pronounce: true,
            theme: "dark".to_string(),
            font_size: 20,
            opacity: 0.98,
            position: "bottom-right".to_string(),
            widget_x: None,
            widget_y: None,
            quiz_frequency: 5,
            streak_days: 1,
            last_active_date: today,
            auto_start: true,
        }
    }
}

#[derive(Clone)]
pub struct ConfigStore {
    path: PathBuf,
    inner: Arc<RwLock<AppConfig>>,
}

impl ConfigStore {
    pub fn load_or_default(base_dir: PathBuf) -> Self {
        let config_dir = base_dir.join("zad-english");
        let _ = fs::create_dir_all(&config_dir);
        let path = config_dir.join("config.json");

        let cfg = if path.exists() {
            fs::read_to_string(&path)
                .ok()
                .and_then(|s| serde_json::from_str::<AppConfig>(&s).ok())
                .unwrap_or_default()
        } else {
            let def = AppConfig::default();
            if let Ok(serialized) = serde_json::to_string_pretty(&def) {
                let _ = fs::write(&path, serialized);
            }
            def
        };

        Self {
            path,
            inner: Arc::new(RwLock::new(cfg)),
        }
    }

    pub fn get(&self) -> AppConfig {
        self.inner.read().clone()
    }

    pub fn update<F>(&self, f: F) -> AppConfig
    where
        F: FnOnce(&mut AppConfig),
    {
        let mut w = self.inner.write();
        f(&mut w);
        self.save_to_disk(&w);
        w.clone()
    }

    pub fn mark_memorized(&self, id: u64) -> AppConfig {
        self.update(|cfg| {
            let mut mem_set: HashSet<u64> = cfg.memorized_ids.iter().cloned().collect();
            mem_set.insert(id);
            cfg.memorized_ids = mem_set.into_iter().collect();

            // remove from review if present
            cfg.review_ids.retain(|&x| x != id);
        })
    }

    pub fn mark_review(&self, id: u64) -> AppConfig {
        self.update(|cfg| {
            let mut rev_set: HashSet<u64> = cfg.review_ids.iter().cloned().collect();
            rev_set.insert(id);
            cfg.review_ids = rev_set.into_iter().collect();

            // remove from memorized if present
            cfg.memorized_ids.retain(|&x| x != id);
        })
    }

    fn save_to_disk(&self, cfg: &AppConfig) {
        if let Ok(s) = serde_json::to_string_pretty(cfg) {
            let _ = fs::write(&self.path, s);
        }
    }
}
