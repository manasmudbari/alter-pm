// @group Types : All API data structures mirroring Rust models

export type ProcessStatus =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'crashed'
  | 'errored'
  | 'watching'
  | 'sleeping'

export interface CronRun {
  run_at: string        // ISO datetime
  exit_code: number | null
  duration_secs: number
}

export interface ProcessInfo {
  id: string
  name: string
  script: string
  args: string[]
  cwd: string | null
  status: ProcessStatus
  pid: number | null
  restart_count: number
  uptime_secs: number | null
  last_exit_code: number | null
  autorestart: boolean
  max_restarts: number
  watch: boolean
  namespace: string
  created_at: string
  started_at: string | null
  stopped_at: string | null
  cron: string | null
  cron_next_run: string | null
  cron_run_history: CronRun[]
}

export interface DaemonHealth {
  status: string
  version: string
  uptime_secs: number
  process_count: number
}

export interface LogLine {
  timestamp: string
  stream: 'stdout' | 'stderr'
  content: string
}

export interface ScriptInfo {
  name: string
  path: string
  language: string
  size_bytes: number
  modified_at: string
}

export interface StartProcessBody {
  script: string
  name?: string
  cwd?: string
  args?: string[]
  env?: Record<string, string>
  namespace?: string
  autorestart?: boolean
  watch?: boolean
  max_restarts?: number
  restart_delay_ms?: number
  watch_paths?: string[]
  cron?: string
}
