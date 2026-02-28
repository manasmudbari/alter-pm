// @group BusinessLogic > Hooks : Pre/post lifecycle hook executor

use anyhow::{ensure, Result};
use std::collections::HashMap;

// @group BusinessLogic > Hooks : Execute a shell hook command
/// Runs via `cmd /C` on Windows, `sh -c` on Unix.
/// Returns Ok(()) if exit code is 0, Err otherwise.
pub async fn run_hook(
    hook_cmd: &str,
    cwd: Option<&str>,
    env: &HashMap<String, String>,
) -> Result<()> {
    tracing::info!("running hook: {hook_cmd}");

    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = tokio::process::Command::new("cmd");
        c.arg("/C").arg(hook_cmd);
        c
    };

    #[cfg(not(target_os = "windows"))]
    let mut cmd = {
        let mut c = tokio::process::Command::new("sh");
        c.arg("-c").arg(hook_cmd);
        c
    };

    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    for (k, v) in env {
        cmd.env(k, v);
    }

    // Suppress console window on Windows
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let output = cmd.output().await?;
    let exit_code = output.status.code();

    if !output.stdout.is_empty() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        tracing::info!("hook stdout: {}", stdout.trim());
    }
    if !output.stderr.is_empty() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        tracing::warn!("hook stderr: {}", stderr.trim());
    }

    ensure!(
        output.status.success(),
        "hook '{}' failed with exit code: {:?}",
        hook_cmd,
        exit_code
    );

    Ok(())
}
