// @group BusinessLogic : Notification sender — dispatches webhook / Slack / Teams payloads

use crate::config::notification_store::NotificationsStore;
use crate::models::notification::{NotificationConfig, SlackTarget, TeamsTarget, WebhookTarget};
use crate::models::process_info::ProcessInfo;
use chrono::Utc;
use serde_json::{json, Value};

// @group Types > ProcessEvent : Lifecycle event that can trigger a notification
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProcessEvent {
    Started,
    Stopped,
    Crashed,
    Restarted,
}

impl ProcessEvent {
    pub fn label(self) -> &'static str {
        match self {
            ProcessEvent::Started   => "started",
            ProcessEvent::Stopped   => "stopped",
            ProcessEvent::Crashed   => "crashed",
            ProcessEvent::Restarted => "restarted",
        }
    }

    pub fn emoji(self) -> &'static str {
        match self {
            ProcessEvent::Started   => "🟢",
            ProcessEvent::Stopped   => "⚪",
            ProcessEvent::Crashed   => "🔴",
            ProcessEvent::Restarted => "🔄",
        }
    }
}

// @group BusinessLogic > FireEvent : Resolve effective config and dispatch all enabled channels
pub async fn fire_event(store: &NotificationsStore, proc: &ProcessInfo, event: ProcessEvent) {
    // Cascade: process → namespace → global (first non-None wins per channel)
    let ns_config = store.namespaces.get(&proc.namespace);

    let effective = merge_configs(proc.notify.as_ref(), ns_config, Some(&store.global));

    // Check event flag
    let should_fire = match event {
        ProcessEvent::Started   => effective.events.on_start,
        ProcessEvent::Stopped   => effective.events.on_stop,
        ProcessEvent::Crashed   => effective.events.on_crash,
        ProcessEvent::Restarted => effective.events.on_restart,
    };

    if !should_fire {
        return;
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .unwrap_or_default();

    if let Some(wh) = &effective.webhook {
        if wh.enabled && !wh.url.is_empty() {
            send_webhook(&client, wh, proc, event).await;
        }
    }
    if let Some(sl) = &effective.slack {
        if sl.enabled && !sl.webhook_url.is_empty() {
            send_slack(&client, sl, proc, event).await;
        }
    }
    if let Some(tm) = &effective.teams {
        if tm.enabled && !tm.webhook_url.is_empty() {
            send_teams(&client, tm, proc, event).await;
        }
    }
}

// @group BusinessLogic > MergeConfigs : Cascade process → namespace → global, first non-None wins per channel
fn merge_configs(
    process: Option<&NotificationConfig>,
    namespace: Option<&NotificationConfig>,
    global: Option<&NotificationConfig>,
) -> NotificationConfig {
    let sources: Vec<&NotificationConfig> = [process, namespace, global]
        .iter()
        .filter_map(|o| *o)
        .collect();

    // For events: use the most-specific scope that has any event enabled, else merge all
    let events = sources
        .iter()
        .find(|c| {
            c.events.on_crash || c.events.on_restart || c.events.on_start || c.events.on_stop
        })
        .map(|c| c.events.clone())
        .unwrap_or_default();

    let webhook = sources.iter().find_map(|c| c.webhook.clone());
    let slack   = sources.iter().find_map(|c| c.slack.clone());
    let teams   = sources.iter().find_map(|c| c.teams.clone());

    NotificationConfig { webhook, slack, teams, events }
}

// @group BusinessLogic > SendWebhook : POST generic JSON payload to webhook URL
async fn send_webhook(client: &reqwest::Client, wh: &WebhookTarget, proc: &ProcessInfo, event: ProcessEvent) {
    let payload = json!({
        "event":     event.label(),
        "timestamp": Utc::now().to_rfc3339(),
        "process": {
            "id":        proc.id,
            "name":      proc.name,
            "namespace": proc.namespace,
            "status":    format!("{:?}", proc.status).to_lowercase(),
            "script":    proc.script,
            "pid":       proc.pid,
            "restart_count": proc.restart_count,
        }
    });

    if let Err(e) = client.post(&wh.url).json(&payload).send().await {
        tracing::warn!("webhook notification failed for '{}': {e}", proc.name);
    }
}

// @group BusinessLogic > SendSlack : POST Slack-formatted message card
async fn send_slack(client: &reqwest::Client, sl: &SlackTarget, proc: &ProcessInfo, event: ProcessEvent) {
    let color = match event {
        ProcessEvent::Started   => "#36a64f",
        ProcessEvent::Stopped   => "#aaaaaa",
        ProcessEvent::Crashed   => "#ff0000",
        ProcessEvent::Restarted => "#f0ad4e",
    };

    let text = format!("{} *{}* {}", event.emoji(), proc.name, event.label());

    let mut payload = json!({
        "text": text,
        "attachments": [{
            "color": color,
            "fields": [
                { "title": "Process",   "value": &proc.name,                              "short": true },
                { "title": "Namespace", "value": &proc.namespace,                         "short": true },
                { "title": "Event",     "value": event.label(),                           "short": true },
                { "title": "Status",    "value": format!("{:?}", proc.status).to_lowercase(), "short": true },
            ],
            "footer": "alter-pm2",
            "ts": Utc::now().timestamp(),
        }]
    });

    if let Some(channel) = &sl.channel {
        if !channel.is_empty() {
            payload["channel"] = Value::String(channel.clone());
        }
    }

    if let Err(e) = client.post(&sl.webhook_url).json(&payload).send().await {
        tracing::warn!("Slack notification failed for '{}': {e}", proc.name);
    }
}

// @group BusinessLogic > SendTeams : POST Microsoft Teams adaptive card
async fn send_teams(client: &reqwest::Client, tm: &TeamsTarget, proc: &ProcessInfo, event: ProcessEvent) {
    let summary = format!("{} {} — alter-pm2", proc.name, event.label());

    let payload = json!({
        "@type":      "MessageCard",
        "@context":   "http://schema.org/extensions",
        "summary":    &summary,
        "themeColor": match event {
            ProcessEvent::Crashed   => "FF0000",
            ProcessEvent::Started   => "36a64f",
            ProcessEvent::Restarted => "f0ad4e",
            ProcessEvent::Stopped   => "aaaaaa",
        },
        "title": format!("{} {}", event.emoji(), &summary),
        "sections": [{
            "facts": [
                { "name": "Process",    "value": &proc.name },
                { "name": "Namespace",  "value": &proc.namespace },
                { "name": "Event",      "value": event.label() },
                { "name": "Status",     "value": format!("{:?}", proc.status).to_lowercase() },
                { "name": "Timestamp",  "value": Utc::now().to_rfc3339() },
            ]
        }]
    });

    if let Err(e) = client.post(&tm.webhook_url).json(&payload).send().await {
        tracing::warn!("Teams notification failed for '{}': {e}", proc.name);
    }
}
