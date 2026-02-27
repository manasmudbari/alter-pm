// @group Configuration : Binary entry point — parses CLI args and delegates to shared logic

use alter::cli::args::Cli;
use clap::Parser;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    alter::run_cli(Cli::parse()).await
}
