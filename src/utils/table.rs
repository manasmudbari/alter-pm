// @group Utilities : Terminal table renderer for `alter list`

use crate::models::process_info::ProcessInfo;
use crate::utils::format::{format_uptime, status_color, BOLD, DIM, RESET};

pub fn render_process_table(processes: &[ProcessInfo]) {
    if processes.is_empty() {
        println!("{DIM}No processes running.{RESET}");
        return;
    }

    // Column widths
    let name_w = processes.iter().map(|p| p.name.len()).max().unwrap_or(4).max(4);
    let id_w = 8; // first 8 chars of UUID

    println!(
        "{BOLD}{:<id_w$}  {:<name_w$}  {:<10}  {:<6}  {:<8}  {:<8}  {:<5}{RESET}",
        "ID", "NAME", "STATUS", "PID", "UPTIME", "RESTARTS", "WATCH",
        id_w = id_w,
        name_w = name_w,
    );

    println!("{}", "-".repeat(id_w + name_w + 60));

    for p in processes {
        let id_short = p.id.to_string()[..8].to_string();
        let status_str = p.status.to_string();
        let color = status_color(&status_str);
        let pid_str = p.pid.map(|n| n.to_string()).unwrap_or_else(|| "-".to_string());
        let uptime_str = p.uptime_secs.map(format_uptime).unwrap_or_else(|| "-".to_string());
        let watch_str = if p.watch { "yes" } else { "no" };

        println!(
            "{:<id_w$}  {:<name_w$}  {color}{:<10}{RESET}  {:<6}  {:<8}  {:<8}  {:<5}",
            id_short,
            p.name,
            status_str,
            pid_str,
            uptime_str,
            p.restart_count,
            watch_str,
            id_w = id_w,
            name_w = name_w,
        );
    }
}
