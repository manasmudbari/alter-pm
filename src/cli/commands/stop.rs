// @group BusinessLogic : `alter stop` command handler

use crate::client::daemon_client::DaemonClient;
use anyhow::Result;

pub async fn run(client: &DaemonClient, target: &str, json_mode: bool) -> Result<()> {
    require_alive(client).await;

    if target == "all" {
        let list = client.get("/api/v1/processes").await?;
        let processes = list["processes"].as_array().cloned().unwrap_or_default();
        for p in &processes {
            let id = p["id"].as_str().unwrap_or_default();
            if let Err(e) = client.post(&format!("/api/v1/processes/{id}/stop"), serde_json::json!({})).await {
                eprintln!("[alter] failed to stop {}: {e}", p["name"].as_str().unwrap_or(id));
            } else if !json_mode {
                println!("[alter] stopped '{}'", p["name"].as_str().unwrap_or(id));
            }
        }
        return Ok(());
    }

    let id = resolve_id(client, target).await?;
    let result = client.post(&format!("/api/v1/processes/{id}/stop"), serde_json::json!({})).await?;

    if json_mode {
        println!("{}", serde_json::to_string_pretty(&result)?);
    } else {
        let name = result["name"].as_str().unwrap_or(target);
        println!("[alter] stopped '{name}'");
    }
    Ok(())
}

pub async fn require_alive(client: &DaemonClient) {
    if !client.is_alive().await {
        eprintln!("[alter] daemon is not running. Start it with: alter daemon start");
        std::process::exit(1);
    }
}

pub async fn resolve_id(client: &DaemonClient, name_or_id: &str) -> Result<String> {
    // Try direct UUID first
    if name_or_id.len() == 36 && name_or_id.contains('-') {
        return Ok(name_or_id.to_string());
    }
    // Search by name
    let list = client.get("/api/v1/processes").await?;
    if let Some(processes) = list["processes"].as_array() {
        for p in processes {
            if p["name"].as_str() == Some(name_or_id) {
                if let Some(id) = p["id"].as_str() {
                    return Ok(id.to_string());
                }
            }
        }
    }
    // Fall back: pass as-is and let the server resolve
    Ok(name_or_id.to_string())
}
