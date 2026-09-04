use crate::config::ConfigStore;
use parking_lot::Mutex;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::async_runtime::JoinHandle;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TickAction {
    ShowWord,
    ShowQuiz,
}

#[derive(Clone)]
pub struct Orchestrator {
    running: Arc<AtomicBool>,
    counter: Arc<AtomicU32>,
    task: Arc<Mutex<Option<JoinHandle<()>>>>,
}

impl Orchestrator {
    pub fn new() -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
            counter: Arc::new(AtomicU32::new(0)),
            task: Arc::new(Mutex::new(None)),
        }
    }

    pub fn start<F>(&self, store: ConfigStore, callback: F)
    where
        F: Fn(TickAction) + Send + Sync + 'static,
    {
        self.stop();

        let running = self.running.clone();
        running.store(true, Ordering::SeqCst);
        let counter = self.counter.clone();
        let cb = Arc::new(callback);

        let handle = tauri::async_runtime::spawn(async move {
            log::info!("Orchestrator background loop started");
            loop {
                if !running.load(Ordering::SeqCst) {
                    break;
                }

                let cfg = store.get();
                let mins = cfg.interval_minutes.max(1);
                let wait_duration = Duration::from_secs(mins * 60);

                tokio::time::sleep(wait_duration).await;

                if !running.load(Ordering::SeqCst) {
                    break;
                }

                let cur_count = counter.fetch_add(1, Ordering::SeqCst) + 1;
                let quiz_freq = cfg.quiz_frequency;

                let action = if quiz_freq > 0 && cur_count % quiz_freq == 0 {
                    TickAction::ShowQuiz
                } else {
                    TickAction::ShowWord
                };

                log::debug!("Orchestrator tick: {:?}", action);
                cb(action);
            }
        });

        *self.task.lock() = Some(handle);
    }

    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
        let mut lock = self.task.lock();
        if let Some(h) = lock.take() {
            h.abort();
        }
    }
}
