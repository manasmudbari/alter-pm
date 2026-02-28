// @group BusinessLogic > HealthCheck : HTTP/TCP health check probe loop

use crate::models::process_info::HealthCheckStatus;
use crate::models::process_status::ProcessStatus;
use crate::notifications::events::NotificationEvent;
use crate::process::instance::ManagedProcess;
use chrono::Utc;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{mpsc, RwLock};
use uuid::Uuid;

// @group BusinessLogic > HealthCheck : Probe a URL via HTTP GET or TCP connect
async fn probe(url: &str, timeout_secs: u64) -> bool {
    let timeout_dur = Duration::from_secs(timeout_secs);

    if url.starts_with("http://") || url.starts_with("https://") {
        // HTTP probe — check for 2xx
        match tokio::time::timeout(timeout_dur, async {
            reqwest::Client::new()
                .get(url)
                .timeout(timeout_dur)
                .send()
                .await
        })
        .await
        {
            Ok(Ok(resp)) => resp.status().is_success(),
            _ => false,
        }
    } else {
        // TCP probe — parse as host:port, try to connect
        match tokio::time::timeout(timeout_dur, tokio::net::TcpStream::connect(url)).await {
            Ok(Ok(_)) => true,
            _ => false,
        }
    }
}

// @group BusinessLogic > HealthCheck : Spawn a health check loop for a process
pub fn start_health_check(
    process_id: Uuid,
    arc: Arc<RwLock<ManagedProcess>>,
    url: String,
    interval_secs: u64,
    timeout_secs: u64,
    retries: u32,
    notification_tx: mpsc::Sender<NotificationEvent>,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let mut consecutive_failures: u32 = 0;

        // Wait for the process to start before probing
        tokio::time::sleep(Duration::from_secs(interval_secs.min(5))).await;

        loop {
            tokio::time::sleep(Duration::from_secs(interval_secs)).await;

            // Only check if process is Running or Watching
            let should_check = {
                let proc = arc.read().await;
                matches!(
                    proc.status,
                    ProcessStatus::Running | ProcessStatus::Watching
                )
            };
            if !should_check {
                continue;
            }

            let healthy = probe(&url, timeout_secs).await;

            let mut proc = arc.write().await;
            if healthy {
                if consecutive_failures > 0 {
                    tracing::info!(
                        "process '{}' health check recovered after {} failures",
                        proc.config.name,
                        consecutive_failures
                    );
                }
                consecutive_failures = 0;
                proc.health_status = Some(HealthCheckStatus::Healthy);
            } else {
                consecutive_failures += 1;
                tracing::warn!(
                    "process '{}' health check failed ({}/{})",
                    proc.config.name,
                    consecutive_failures,
                    retries
                );
                if consecutive_failures >= retries {
                    proc.health_status = Some(HealthCheckStatus::Unhealthy);
                    let _ = notification_tx
                        .send(NotificationEvent::HealthCheckFailed {
                            process_name: proc.config.name.clone(),
                            url: url.clone(),
                            timestamp: Utc::now(),
                        })
                        .await;
                }
            }
        }
    })
}
