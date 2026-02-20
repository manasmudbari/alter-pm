// @group BusinessLogic : `alter flush` command handler — delete log files

use crate::client::daemon_client::DaemonClient;
use crate::cli::commands::stop::{require_alive, resolve_id};
use anyhow::Result;

pub async fn run(client: &DaemonClient, target: Option<&str>, json_mode: bool) -> Result<()> {
    require_alive(client).await;

    let targets: Vec<String> = if let Some(t) = target {
        if t == "all" {
            let list = client.get("/api/v1/processes").await?;
            list["processes"]
                .as_array()
                .unwrap_or(&vec![])
                .iter()
                .filter_map(|p| p["id"].as_str().map(String::from))
                .collect()
        } else {
            vec![resolve_id(client, t).await?]
        }
    } else {
        let list = client.get("/api/v1/processes").await?;
        list["processes"]
            .as_array()
            .unwrap_or(&vec![])
            .iter()
            .filter_map(|p| p["id"].as_str().map(String::from))
            .collect()
    };

    for id in targets {
        match client.delete(&format!("/api/v1/processes/{id}/logs")).await {
            Ok(_) => { if !json_mode { println!("[alter] flushed logs for {id}"); } }
            Err(e) => eprintln!("[alter] failed to flush logs for {id}: {e}"),
        }
    }
    Ok(())
}
