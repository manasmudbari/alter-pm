// @group BusinessLogic : `alter startup` / `alter unstartup` command handlers
// Generates OS startup scripts to auto-start the daemon on boot

use anyhow::Result;

pub async fn run_startup() -> Result<()> {
    let exe = std::env::current_exe()?
        .to_string_lossy()
        .to_string();

    #[cfg(target_os = "windows")]
    {
        println!("[alter] To auto-start the daemon on Windows login, run this in PowerShell (as Administrator):");
        println!();
        println!(r#"  $action = New-ScheduledTaskAction -Execute "{exe}" -Argument "daemon start""#);
        println!(r#"  $trigger = New-ScheduledTaskTrigger -AtLogon"#);
        println!(r#"  Register-ScheduledTask -TaskName "alter-daemon" -Action $action -Trigger $trigger -RunLevel Highest"#);
    }

    #[cfg(target_os = "linux")]
    {
        let unit = format!(
r#"[Unit]
Description=alter process manager daemon
After=network.target

[Service]
Type=forking
ExecStart={exe} --internal-daemon
Restart=on-failure
User={user}

[Install]
WantedBy=multi-user.target
"#,
            exe = exe,
            user = std::env::var("USER").unwrap_or_else(|_| "root".to_string()),
        );

        let path = "/etc/systemd/system/alter-daemon.service";
        println!("[alter] Writing systemd unit to {path}");
        println!("[alter] Run: sudo systemctl enable alter-daemon && sudo systemctl start alter-daemon");
        println!();
        println!("{unit}");
    }

    #[cfg(target_os = "macos")]
    {
        let label = "com.alter-pm.daemon";
        let plist_path = format!(
            "{}/Library/LaunchAgents/{label}.plist",
            std::env::var("HOME").unwrap_or_else(|_| "~".to_string())
        );
        let plist = format!(
r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>{label}</string>
    <key>ProgramArguments</key>
    <array>
        <string>{exe}</string>
        <string>--internal-daemon</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
    <key>StandardOutPath</key>
    <string>/tmp/alter-daemon.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/alter-daemon.err</string>
</dict>
</plist>
"#
        );
        println!("[alter] Writing LaunchAgent plist to: {plist_path}");
        if let Some(parent) = std::path::Path::new(&plist_path).parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        std::fs::write(&plist_path, &plist)?;
        println!("[alter] Run the following to enable auto-start on login:");
        println!("  launchctl load {plist_path}");
    }

    Ok(())
}

pub async fn run_unstartup() -> Result<()> {
    #[cfg(target_os = "windows")]
    {
        println!("[alter] To remove startup task, run in PowerShell (as Administrator):");
        println!(r#"  Unregister-ScheduledTask -TaskName "alter-daemon" -Confirm:$false"#);
    }

    #[cfg(target_os = "linux")]
    {
        println!("[alter] To remove systemd unit:");
        println!("  sudo systemctl disable alter-daemon");
        println!("  sudo rm /etc/systemd/system/alter-daemon.service");
    }

    #[cfg(target_os = "macos")]
    {
        let label = "com.alter-pm.daemon";
        let plist_path = format!(
            "{}/Library/LaunchAgents/{label}.plist",
            std::env::var("HOME").unwrap_or_else(|_| "~".to_string())
        );
        println!("[alter] To remove the LaunchAgent:");
        println!("  launchctl unload {plist_path}");
        println!("  rm {plist_path}");
    }

    Ok(())
}
