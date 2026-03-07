// @group APIEndpoints : All fetch calls to the alter daemon REST API

import type { CronRun, DaemonHealth, EnvFileEntry, LogLine, NotificationConfig, NotificationsStore, ProcessInfo, ScriptInfo, StartProcessBody } from '@/types'

// @group Types > AI : Chat message and request types (mirrored from Rust models/ai.rs)
export interface AiChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AiChatRequest {
  message: string
  process_id?: string
  history: AiChatMessage[]
}

export interface AiSettingsInfo {
  github_token_set: boolean
  github_token_hint: string
  model: string
  enabled: boolean
  github_username: string
  client_id_set: boolean
}

export interface AiAuthStartResponse {
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
}

export interface AiAuthStatusResponse {
  status: 'idle' | 'pending' | 'expired' | 'denied' | 'complete' | 'error'
  username?: string
  interval?: number
  message?: string
}

export interface AiModelInfo {
  id: string
  name: string
  publisher: string
  summary: string
}

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

  // @group APIEndpoints > AI : Get stored AI settings (token is masked server-side)
  aiGetSettings: (): Promise<AiSettingsInfo> =>
    request('/ai/settings'),

  // @group APIEndpoints > AI : Persist AI settings (send empty string to keep existing token/client_id)
  aiSaveSettings: (body: { github_token?: string; model?: string; enabled?: boolean; client_id?: string }): Promise<{ success: boolean }> =>
    request('/ai/settings', { method: 'PUT', body: JSON.stringify(body) }),

  // @group APIEndpoints > AI : Begin GitHub OAuth Device Flow — returns user_code to display
  aiAuthStart: (): Promise<AiAuthStartResponse> =>
    request('/ai/auth/start', { method: 'POST' }),

  // @group APIEndpoints > AI : Poll GitHub token exchange — returns current auth status
  aiAuthStatus: (): Promise<AiAuthStatusResponse> =>
    request('/ai/auth/status'),

  // @group APIEndpoints > AI : Disconnect GitHub account — clears stored token and username
  aiAuthLogout: (): Promise<{ success: boolean }> =>
    request('/ai/auth', { method: 'DELETE' }),

  // @group APIEndpoints > AI : List GitHub Models catalog (chat-completion models only)
  aiGetModels: (): Promise<{ models: AiModelInfo[] }> =>
    request('/ai/models'),

  // @group APIEndpoints > AI : Stream a chat response — returns AbortController to cancel
  aiChat(
    req: AiChatRequest,
    onDelta: (token: string) => void,
    onDone: () => void,
    onError: (msg: string) => void,
  ): AbortController {
    const abort = new AbortController()
    ;(async () => {
      try {
        const res = await fetch(`${BASE}/ai/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(req),
          signal: abort.signal,
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          onError((data as { error?: string }).error ?? `HTTP ${res.status}`)
          return
        }
        const reader = res.body?.getReader()
        if (!reader) { onDone(); return }
        const decoder = new TextDecoder()
        let buf = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith('data: ')) continue
            const payload = trimmed.slice(6)
            try {
              const parsed = JSON.parse(payload) as { delta?: string; done?: boolean; error?: string }
              if (parsed.error) { onError(parsed.error); return }
              if (parsed.done)  { onDone(); return }
              if (parsed.delta) onDelta(parsed.delta)
            } catch { /* ignore malformed lines */ }
          }
        }
        onDone()
      } catch (e: unknown) {
        if ((e as Error)?.name !== 'AbortError') {
          onError((e as Error)?.message ?? 'Connection error')
        }
      }
    })()
    return abort
  },
}
