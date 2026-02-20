// @group Utilities : Duration, bytes, and uptime formatting helpers

pub fn format_uptime(secs: u64) -> String {
    if secs < 60 {
        format!("{secs}s")
    } else if secs < 3600 {
        format!("{}m {}s", secs / 60, secs % 60)
    } else if secs < 86400 {
        format!("{}h {}m", secs / 3600, (secs % 3600) / 60)
    } else {
        format!("{}d {}h", secs / 86400, (secs % 86400) / 3600)
    }
}

pub fn format_bytes(bytes: u64) -> String {
    if bytes < 1024 {
        format!("{bytes}B")
    } else if bytes < 1024 * 1024 {
        format!("{:.1}KB", bytes as f64 / 1024.0)
    } else {
        format!("{:.1}MB", bytes as f64 / (1024.0 * 1024.0))
    }
}

pub fn status_color(status: &str) -> &'static str {
    match status {
        "running" | "watching" => "\x1b[32m",  // green
        "stopped"              => "\x1b[33m",  // yellow
        "crashed"              => "\x1b[31m",  // red
        "errored"              => "\x1b[35m",  // magenta
        "starting"             => "\x1b[36m",  // cyan
        "stopping"             => "\x1b[33m",  // yellow
        _                      => "\x1b[0m",   // reset
    }
}

pub const RESET: &str = "\x1b[0m";
pub const BOLD: &str = "\x1b[1m";
pub const DIM: &str = "\x1b[2m";
