// @group BusinessLogic > RollingRestart : Rolling restart for multi-instance processes (design stub)
//
// Algorithm (when instances > 1 is fully implemented):
// 1. For each instance i in 0..N:
//    a. Start a NEW instance i' with the updated config
//    b. Wait until i' is Running + healthy (health check passes)
//    c. Stop the OLD instance i
//    d. Wait restart_delay_ms before moving to i+1
// 2. This ensures at least (N-1) instances are always running during the restart.
//
// Implementation will be added when multi-instance support is fully built.

use anyhow::Result;

pub async fn rolling_restart(
    _manager: &crate::process::manager::ProcessManager,
    _process_name: &str,
    _new_config: crate::config::ecosystem::AppConfig,
) -> Result<()> {
    anyhow::bail!("rolling restart requires multi-instance support (not yet implemented)")
}
