// @group DatabaseOperations : Daemon shared state — process registry with disk persistence

use crate::config::daemon_config::DaemonConfig;
use crate::config::ecosystem::AppConfig;
use crate::config::notification_store::NotificationsStore;
use crate::models::cron_run::CronRun;
use crate::models::process_info::ProcessInfo;
use crate::process::manager::ProcessManager;
use anyhow::Result;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;


/// Persistent snapshot of process configs (saved to disk)
#[derive(Serialize, Deserialize, Default)]
pub struct SavedState {
    pub saved_at: Option<DateTime<Utc>>,
    pub apps: Vec<SavedApp>,
}

#[derive(Serialize, Deserialize)]
pub struct SavedApp {
    pub id: Uuid,
    pub config: AppConfig,
    pub restart_count: u32,
    pub autorestart_on_restore: bool,
    #[serde(default)]
    pub cron_run_history: Vec<CronRun>,
    /// PID of the process at the time state was last saved.
    /// Used on restore to detect and clean up orphaned OS processes.
    #[serde(default)]
    pub last_pid: Option<u32>,
}

/// Live daemon state — shared across all Axum handlers
pub struct DaemonState {
    pub manager: ProcessManager,
    pub config: DaemonConfig,
    pub started_at: DateTime<Utc>,
    pub notifications: Arc<RwLock<NotificationsStore>>,
}

impl DaemonState {
    pub fn new(config: DaemonConfig) -> Self {
        let notifications = Arc::new(RwLock::new(crate::config::notification_store::load()));
        Self {
            manager: ProcessManager::new(Arc::clone(&notifications)),
            config,
            started_at: Utc::now(),
            notifications,
        }
    }

    // @group DatabaseOperations : Serialize current process list to JSON file
    pub async fn save_to_disk(&self) -> Result<()> {
        let processes = self.manager.list().await;
        let apps = processes
            .into_iter()
            .map(|p| SavedApp {
                id: p.id,
                config: build_app_config(&p),
                restart_count: p.restart_count,
                autorestart_on_restore: p.autorestart,
                cron_run_history: p.cron_run_history,
                last_pid: p.pid,
            })
            .collect();

        let saved = SavedState {
            saved_at: Some(Utc::now()),
            apps,
        };

        let path = crate::config::paths::state_file();
        let tmp = path.with_extension("json.tmp");
        let content = serde_json::to_string_pretty(&saved)?;
        std::fs::write(&tmp, content)?;
        std::fs::rename(tmp, path)?;
        Ok(())
    }

    // @group DatabaseOperations : Load persisted state from disk
    pub async fn load_from_disk() -> Result<SavedState> {
        let path = crate::config::paths::state_file();
        let content = std::fs::read_to_string(path)?;
        let state: SavedState = serde_json::from_str(&content)?;
        Ok(state)
    }

    // @group DatabaseOperations : Restore previously saved processes on daemon startup.
    //
    // Strategy (PID-first):
    //   • Cron jobs     → always restore as Sleeping (kill any stale PID first to avoid duplicates)
    //   • last_pid alive  → re-adopt the running process; a watcher fires autorestart when it exits
    //   • last_pid dead   → mark Stopped; user decides when to restart
    //   • no last_pid     → mark Stopped (daemon crashed before the process was ever saved with a PID)
    //
    // This prevents both duplicate spawns and silent orphan accumulation.
    pub async fn restore(&self, saved: SavedState) {
        use crate::process::manager::{is_pid_alive, kill_orphan_pid};

        for app in saved.apps {
            if app.config.cron.is_some() {
                // Cron jobs are idempotent — kill any stale duplicate, then re-register as Sleeping
                if let Some(pid) = app.last_pid {
                    if is_pid_alive(pid) {
                        tracing::info!(
                            "killing stale cron process '{}' (PID {}) before re-registering",
                            app.config.name, pid
                        );
                        kill_orphan_pid(pid);
                    }
                }
                if let Err(e) = self.manager.register_sleeping(app.config, app.cron_run_history).await {
                    tracing::warn!("failed to restore cron process '{}': {e}", app.id);
                }
                continue;
            }

            match app.last_pid {
                Some(pid) if is_pid_alive(pid) => {
                    // Process survived the daemon restart — re-adopt it
                    tracing::info!(
                        "re-adopting running process '{}' (PID {})",
                        app.config.name, pid
                    );
                    self.manager.register_running_adopted(app.config, pid).await;
                }
                Some(pid) => {
                    // Process died while daemon was down — mark stopped, let user restart
                    tracing::info!(
                        "process '{}' (PID {}) exited while daemon was down — marking stopped",
                        app.config.name, pid
                    );
                    self.manager.register_stopped(app.config).await;
                }
                None => {
                    // No PID was ever saved — mark stopped
                    self.manager.register_stopped(app.config).await;
                }
            }
        }
    }
}

fn build_app_config(info: &ProcessInfo) -> AppConfig {
    use crate::config::ecosystem::AppConfig;
    AppConfig {
        name: info.name.clone(),
        script: info.script.clone(),
        args: info.args.clone(),
        cwd: info.cwd.clone(),
        instances: 1,
        autorestart: info.autorestart,
        max_restarts: info.max_restarts,
        restart_delay_ms: 1000,
        namespace: info.namespace.clone(),
        watch: info.watch,
        watch_paths: vec![],
        watch_ignore: vec![],
        env: info.env.clone(),
        log_file: None,
        error_file: None,
        max_log_size_mb: 10,
        cron: info.cron.clone(),
        cron_last_run: None,
        cron_next_run: info.cron_next_run,
        notify: info.notify.clone(),
        env_file: None,
        health_check_url: None,
        health_check_interval_secs: 30,
        health_check_timeout_secs: 5,
        health_check_retries: 3,
        pre_start: None,
        post_start: None,
        pre_stop: None,
    }
}
