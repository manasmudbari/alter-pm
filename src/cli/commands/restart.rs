// @group BusinessLogic : `alter restart` command handler

use crate::client::daemon_client::DaemonClient;
use crate::cli::commands::stop::{require_alive, resolve_id};
use anyhow::Result;

pub async fn run(client: &DaemonClient, target: &str, json_mode: bool) -> Result<()> {
    require_alive(client).await;

    if target == "all" {
        let list = client.get("/api/v1/processes").await?;
        let processes = list["processes"].as_array().cloned().unwrap_or_default();
        for p in &processes {
            let id = p["id"].as_str().unwrap_or_default();
            if let Err(e) = client.post(&format!("/api/v1/processes/{id}/restart"), serde_json::json!({})).await {
                eprintln!("[alter] failed to restart {}: {e}", p["name"].as_str().unwrap_or(id));
            } else if !json_mode {
                println!("[alter] restarted '{}'", p["name"].as_str().unwrap_or(id));
            }
        }
        return Ok(());
    }

    let id = resolve_id(client, target).await?;
    let result = client.post(&format!("/api/v1/processes/{id}/restart"), serde_json::json!({})).await?;

    if json_mode {
        println!("{}", serde_json::to_string_pretty(&result)?);
    } else {
        let name = result["name"].as_str().unwrap_or(target);
        println!("[alter] restarted '{name}'");
    }
    Ok(())
}
