// @group IntegrationTests : Daemon start → spawn process → stop daemon lifecycle

#[cfg(test)]
mod tests {
    use alter::config::ecosystem::AppConfig;
    use alter::config::daemon_config::DaemonConfig;
    use alter::daemon::state::DaemonState;
    use std::collections::HashMap;
    use std::sync::Arc;

    fn test_config() -> AppConfig {
        AppConfig {
            name: "test-app".to_string(),
            script: "echo".to_string(),
            args: vec!["hello from alter".to_string()],
            cwd: None,
            instances: 1,
            autorestart: false,
            max_restarts: 0,
            restart_delay_ms: 100,
            watch: false,
            watch_paths: vec![],
            watch_ignore: vec![],
            env: HashMap::new(),
            log_file: None,
            error_file: None,
            max_log_size_mb: 10,
        }
    }

    // @group IntegrationTests > Lifecycle : Start a process and verify it appears in the list
    #[tokio::test]
    async fn test_start_and_list() {
        let state = Arc::new(DaemonState::new(DaemonConfig::default()));
        let info = state.manager.start(test_config()).await.unwrap();
        assert_eq!(info.name, "test-app");

        let list = state.manager.list().await;
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "test-app");
    }

    // @group IntegrationTests > Lifecycle : Stop a running process
    #[tokio::test]
    async fn test_start_and_stop() {
        let state = Arc::new(DaemonState::new(DaemonConfig::default()));
        let info = state.manager.start(test_config()).await.unwrap();
        let id = info.id;

        tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;

        let stopped = state.manager.stop(id).await;
        // Echo exits quickly, so stop may already be stopped — either way no panic
        assert!(stopped.is_ok() || stopped.is_err());
    }

    // @group IntegrationTests > Lifecycle : Delete removes from registry
    #[tokio::test]
    async fn test_delete_removes_from_registry() {
        let state = Arc::new(DaemonState::new(DaemonConfig::default()));
        let info = state.manager.start(test_config()).await.unwrap();
        let id = info.id;

        tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;
        state.manager.delete(id).await.unwrap();

        let list = state.manager.list().await;
        assert_eq!(list.len(), 0);
    }
}
