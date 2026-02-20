// @group BusinessLogic : `alter delete` command handler

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
            let _ = client.delete(&format!("/api/v1/processes/{id}")).await;
            if !json_mode {
                println!("[alter] deleted '{}'", p["name"].as_str().unwrap_or(id));
            }
        }
        return Ok(());
    }

    let id = resolve_id(client, target).await?;
    let _ = client.delete(&format!("/api/v1/processes/{id}")).await?;

    if !json_mode {
        println!("[alter] deleted '{target}'");
    }
    Ok(())
}
