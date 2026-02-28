// @group APIEndpoints : All fetch calls to the alter daemon REST API

import type { CronRun, DaemonHealth, EnvFileEntry, LogLine, NotificationConfig, NotificationsStore, ProcessInfo, ScriptInfo, StartProcessBody } from '@/types'

const BASE = '/api/v1'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

// @group APIEndpoints > Processes
export const api = {
  getProcesses: (): Promise<{ processes: ProcessInfo[] }> =>
    request('/processes'),

  getProcess: (id: string): Promise<ProcessInfo> =>
    request(`/processes/${id}`),

  startProcess: (body: StartProcessBody): Promise<ProcessInfo> =>
    request('/processes', { method: 'POST', body: JSON.stringify(body) }),

  stopProcess: (id: string): Promise<ProcessInfo> =>
    request(`/processes/${id}/stop`, { method: 'POST' }),

  startStopped: (id: string): Promise<ProcessInfo> =>
    request(`/processes/${id}/start`, { method: 'POST' }),

  restartProcess: (id: string): Promise<ProcessInfo> =>
    request(`/processes/${id}/restart`, { method: 'POST' }),

  deleteProcess: (id: string): Promise<void> =>
    request(`/processes/${id}`, { method: 'DELETE' }),

  updateProcess: (id: string, body: StartProcessBody): Promise<ProcessInfo> =>
    request(`/processes/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  resetProcess: (id: string): Promise<ProcessInfo> =>
    request(`/processes/${id}/reset`, { method: 'POST' }),

  openTerminal: (id: string): Promise<void> =>
    request(`/processes/${id}/terminal`, { method: 'POST' }),

  // @group APIEndpoints > Logs
  getLogs: (id: string, params?: { lines?: number; date?: string }): Promise<{ lines: LogLine[] }> => {
    const qs = new URLSearchParams()
    if (params?.lines) qs.set('lines', String(params.lines))
    if (params?.date)  qs.set('date', params.date)
    return request(`/processes/${id}/logs?${qs}`)
  },

  getLogDates: (id: string): Promise<{ dates: string[]; has_current: boolean }> =>
    request(`/processes/${id}/logs/dates`),

  deleteLogs: (id: string): Promise<{ success: boolean }> =>
    request(`/processes/${id}/logs`, { method: 'DELETE' }),

  // @group APIEndpoints > EnvFiles : Process-scoped env file operations
  listEnvFiles: (id: string): Promise<{ files: EnvFileEntry[] }> =>
    request(`/processes/${id}/envfiles`),

  getEnvFile: (id: string, filename = '.env'): Promise<{ content: string; exists: boolean; filename: string }> =>
    request(`/processes/${id}/envfile?filename=${encodeURIComponent(filename)}`),

  saveEnvFile: (id: string, content: string, filename = '.env'): Promise<{ success: boolean; path: string; filename: string }> =>
    request(`/processes/${id}/envfile`, { method: 'PUT', body: JSON.stringify({ content, filename }) }),

  // @group APIEndpoints > EnvFiles : Path-scoped env file operations (for StartPage/EditPage)
  listEnvPath: (dir: string): Promise<{ files: EnvFileEntry[] }> =>
    request(`/system/list-env?path=${encodeURIComponent(dir)}`),

  readEnvFile: (filePath: string): Promise<{ content: string; exists: boolean }> =>
    request(`/system/read-env?path=${encodeURIComponent(filePath)}`),

  writeEnvFile: (filePath: string, content: string): Promise<{ success: boolean; path: string }> =>
    request('/system/write-env', { method: 'POST', body: JSON.stringify({ path: filePath, content }) }),

  syncEnvFiles: (sourcePath: string): Promise<{ success: boolean; synced_files: number; errors?: string[] }> =>
    request('/system/sync-env', { method: 'POST', body: JSON.stringify({ source_path: sourcePath }) }),

  getCronHistory: (id: string): Promise<{ runs: CronRun[] }> =>
    request(`/processes/${id}/cron/history`),

  streamLogs: (id: string): EventSource =>
    new EventSource(`${BASE}/processes/${id}/logs/stream`),

  // @group APIEndpoints > Scripts
  saveScript: (body: { name: string; language: string; content: string }): Promise<{ path: string; name: string; filename: string; language: string }> =>
    request('/scripts', { method: 'POST', body: JSON.stringify(body) }),

  listScripts: (): Promise<{ scripts: ScriptInfo[] }> =>
    request('/scripts'),

  getScript: (name: string): Promise<{ name: string; path: string; content: string; language: string }> =>
    request(`/scripts/${name}`),

  deleteScript: (name: string): Promise<void> =>
    request(`/scripts/${name}`, { method: 'DELETE' }),

  runScript: (name: string): EventSource =>
    new EventSource(`${BASE}/scripts/${name}/run`),

  // @group APIEndpoints > Notifications
  getNotifications: (): Promise<NotificationsStore> =>
    request('/notifications'),

  updateGlobalNotifications: (config: NotificationConfig): Promise<{ success: boolean }> =>
    request('/notifications/global', { method: 'PUT', body: JSON.stringify(config) }),

  updateNamespaceNotifications: (ns: string, config: NotificationConfig): Promise<{ success: boolean }> =>
    request(`/notifications/namespace/${encodeURIComponent(ns)}`, { method: 'PUT', body: JSON.stringify(config) }),

  deleteNamespaceNotifications: (ns: string): Promise<{ success: boolean }> =>
    request(`/notifications/namespace/${encodeURIComponent(ns)}`, { method: 'DELETE' }),

  testNotification: (config: NotificationConfig): Promise<{ success: boolean; message: string }> =>
    request('/notifications/test', { method: 'POST', body: JSON.stringify(config) }),

  // @group APIEndpoints > System
  getHealth: (): Promise<DaemonHealth> =>
    request('/system/health'),

  getSystemPaths: (): Promise<{ data_dir: string; log_dir: string }> =>
    request('/system/paths'),

  checkEnvPath: (dir: string): Promise<{ exists: boolean; path: string }> =>
    request(`/system/check-env?path=${encodeURIComponent(dir)}`),

  browsePath: (dir: string): Promise<{
    path: string
    parent: string | null
    entries: { name: string; path: string; is_dir: boolean }[]
    error?: string
  }> => request(`/system/browse?path=${encodeURIComponent(dir)}`),

  saveState: (): Promise<void> =>
    request('/system/save', { method: 'POST' }),

  shutdownDaemon: (): Promise<void> =>
    request('/system/shutdown', { method: 'POST' }),
}
