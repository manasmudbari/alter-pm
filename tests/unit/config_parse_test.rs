// @group UnitTests : TOML/JSON ecosystem config parsing tests

#[cfg(test)]
mod tests {
    use alter::config::ecosystem::{AppConfig, EcosystemConfig};
    use std::io::Write;
    use tempfile::NamedTempFile;

    // @group UnitTests > Config : Parse minimal TOML
    #[test]
    fn test_parse_minimal_toml() {
        let toml = r#"
[[apps]]
name   = "my-app"
script = "python"
"#;
        let config: EcosystemConfig = toml::from_str(toml).unwrap();
        assert_eq!(config.apps.len(), 1);
        assert_eq!(config.apps[0].name, "my-app");
        assert_eq!(config.apps[0].script, "python");
        assert!(config.apps[0].autorestart); // default true
        assert_eq!(config.apps[0].max_restarts, 10); // default 10
    }

    // @group UnitTests > Config : Parse full TOML with env vars
    #[test]
    fn test_parse_full_toml_with_env() {
        let toml = r#"
[[apps]]
name             = "api"
script           = "node"
args             = ["server.js", "--port", "3000"]
autorestart      = false
max_restarts     = 3
restart_delay_ms = 500

[apps.env]
NODE_ENV = "production"
PORT     = "3000"
"#;
        let config: EcosystemConfig = toml::from_str(toml).unwrap();
        let app = &config.apps[0];
        assert_eq!(app.args, vec!["server.js", "--port", "3000"]);
        assert!(!app.autorestart);
        assert_eq!(app.max_restarts, 3);
        assert_eq!(app.env.get("NODE_ENV"), Some(&"production".to_string()));
        assert_eq!(app.env.get("PORT"), Some(&"3000".to_string()));
    }

    // @group UnitTests > Config : Parse JSON config
    #[test]
    fn test_parse_json_config() {
        let json = r#"{"apps": [{"name": "app", "script": "go", "args": ["run", "main.go"]}]}"#;
        let config: EcosystemConfig = serde_json::from_str(json).unwrap();
        assert_eq!(config.apps[0].script, "go");
    }

    // @group EdgeCases : Missing required fields should fail
    #[test]
    fn test_missing_name_fails() {
        let toml = r#"
[[apps]]
script = "python"
"#;
        let result: Result<EcosystemConfig, _> = toml::from_str(toml);
        assert!(result.is_err());
    }
}
