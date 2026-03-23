// @group Utilities : PID file management — prevents duplicate daemon instances

use anyhow::Result;

pub fn write_pid_file() -> Result<()> {
    let path = crate::config::paths::pid_file();
    std::fs::write(&path, std::process::id().to_string())?;
    Ok(())
}

pub fn remove_pid_file() {
    let path = crate::config::paths::pid_file();
    let _ = std::fs::remove_file(path);
}

pub fn read_pid() -> Option<u32> {
    let path = crate::config::paths::pid_file();
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| s.trim().parse().ok())
}

pub fn is_daemon_running() -> bool {
    match read_pid() {
        Some(pid) => process_exists(pid),
        None => false,
    }
}

fn process_exists(pid: u32) -> bool {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        Command::new("tasklist")
            .args(["/FI", &format!("PID eq {pid}"), "/NH"])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).contains(&pid.to_string()))
            .unwrap_or(false)
    }
    #[cfg(not(target_os = "windows"))]
    {
        // Send signal 0 to check if process exists — works on Linux and macOS.
        // kill(pid, 0) returns 0 if the process exists and we have permission.
        unsafe { libc::kill(pid as libc::pid_t, 0) == 0 }
    }
}
