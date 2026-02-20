// @group BusinessLogic : `alter logs` command handler

use crate::cli::args::LogsArgs;
use crate::client::daemon_client::DaemonClient;
use crate::cli::commands::stop::{require_alive, resolve_id};
use anyhow::Result;

pub async fn run(client: &DaemonClient, args: LogsArgs, json_mode: bool) -> Result<()> {
    require_alive(client).await;

    let id = resolve_id(client, &args.target).await?;
    let stream_type = if args.err { "err" } else { "out" };

    if args.follow {
        println!("[alter] streaming logs for '{}' (Ctrl+C to stop)...", args.target);
        client
            .stream_logs(&id, |line| {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&line) {
                    let ts = val["timestamp"].as_str().unwrap_or("");
                    let content = val["content"].as_str().unwrap_or(&line);
                    let stream = val["stream"].as_str().unwrap_or("out");
                    if stream_type == "all" || stream.starts_with(stream_type) {
                        let prefix = if stream == "stderr" { "\x1b[31m[err]\x1b[0m" } else { "\x1b[32m[out]\x1b[0m" };
                        println!("{prefix} {content}");
                    }
                } else {
                    println!("{line}");
                }
            })
            .await?;
    } else {
        let url = format!(
            "/api/v1/processes/{id}/logs?lines={}&type={}",
            args.lines,
            if args.err { "stderr" } else { "all" }
        );
        let result = client.get(&url).await?;

        if json_mode {
            println!("{}", serde_json::to_string_pretty(&result)?);
            return Ok(());
        }

        if let Some(lines) = result["lines"].as_array() {
            for entry in lines {
                let content = entry["content"].as_str().unwrap_or("");
                let stream = entry["stream"].as_str().unwrap_or("stdout");
                let prefix = if stream == "stderr" { "\x1b[31m[err]\x1b[0m" } else { "\x1b[32m[out]\x1b[0m" };
                println!("{prefix} {content}");
            }
        }
    }
    Ok(())
}
