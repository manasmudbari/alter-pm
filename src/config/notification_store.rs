// @group Configuration : Notification store — load and persist notifications.json

use crate::models::notification::NotificationConfig;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// @group Types > NotificationsStore : Global + per-namespace notification configs
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct NotificationsStore {
    #[serde(default)]
    pub global: NotificationConfig,
    #[serde(default)]
    pub namespaces: HashMap<String, NotificationConfig>,
}

// @group DatabaseOperations : Load notifications store from disk (returns Default if missing or corrupt)
pub fn load() -> NotificationsStore {
    let path = crate::config::paths::data_dir().join("notifications.json");
    if !path.exists() {
        return NotificationsStore::default();
    }
    match std::fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => NotificationsStore::default(),
    }
}

// @group DatabaseOperations : Atomically write notifications store to disk
pub fn save(store: &NotificationsStore) -> anyhow::Result<()> {
    let path = crate::config::paths::data_dir().join("notifications.json");
    let tmp = path.with_extension("json.tmp");
    let content = serde_json::to_string_pretty(store)?;
    std::fs::write(&tmp, content)?;
    std::fs::rename(tmp, path)?;
    Ok(())
}
