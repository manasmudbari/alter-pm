// @group Configuration : Daemon runtime configuration

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DaemonConfig {
    pub host: String,
    pub port: u16,
    pub max_log_size_mb: u64,
    pub max_log_files: usize,
}

impl Default for DaemonConfig {
    fn default() -> Self {
        Self {
            host: "127.0.0.1".to_string(),
            port: 2999,
            max_log_size_mb: 10,
            max_log_files: 5,
        }
    }
}
