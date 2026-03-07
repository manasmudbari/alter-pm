// @group Types : AI assistant settings and chat request/response types

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

// @group Types > AiSettings : Persisted AI configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiSettings {
    #[serde(default)]
    pub github_token: String,
    #[serde(default = "default_model")]
    pub model: String,
    #[serde(default)]
    pub enabled: bool,
    /// GitHub OAuth App Client ID — required for Device Flow login
    #[serde(default)]
    pub client_id: String,
    /// GitHub username stored after a successful OAuth Device Flow login
    #[serde(default)]
    pub github_username: String,
}

fn default_model() -> String {
    "gpt-4o-mini".to_string()
}

impl Default for AiSettings {
    fn default() -> Self {
        Self {
            github_token: String::new(),
            model: default_model(),
            enabled: false,
            client_id: String::new(),
            github_username: String::new(),
        }
    }
}

// @group Types > DeviceAuthState : Ephemeral in-memory state during GitHub Device Flow
pub struct DeviceAuthState {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_at: DateTime<Utc>,
    pub interval_secs: u64,
}

// @group Types > ChatMessage : A single turn in a conversation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

// @group Types > ChatRequest : Incoming request body for POST /ai/chat
#[derive(Debug, Deserialize)]
pub struct ChatRequest {
    pub message: String,
    #[serde(default)]
    pub process_id: Option<String>,
    #[serde(default)]
    pub history: Vec<ChatMessage>,
}
