// @group APIEndpoints : All fetch calls to the alter daemon REST API

import type { CronRun, DaemonHealth, LogLine, ProcessInfo, ScriptInfo, StartProcessBody } from '@/types'

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

  getLogDates: (id: string): Promise<{ dates: string[] }> =>
    request(`/processes/${id}/logs/dates`),

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

  // @group APIEndpoints > System
  getHealth: (): Promise<DaemonHealth> =>
    request('/system/health'),

  saveState: (): Promise<void> =>
    request('/system/save', { method: 'POST' }),

  shutdownDaemon: (): Promise<void> =>
    request('/system/shutdown', { method: 'POST' }),
}
