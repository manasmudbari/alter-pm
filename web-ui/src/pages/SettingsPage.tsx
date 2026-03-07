// @group BusinessLogic : Settings page — all user-configurable preferences

import { useEffect, useRef, useState } from 'react'
import { Copy, Check, Github, Loader, LogOut, RefreshCw } from 'lucide-react'
import type { AiModelInfo } from '@/lib/api'
import type { AppSettings } from '@/lib/settings'
import { DEFAULT_SETTINGS, LOG_TAIL_OPTIONS, REFRESH_INTERVAL_OPTIONS } from '@/lib/settings'
import { api } from '@/lib/api'
import { inputStyle } from './StartPage'

interface Props {
  settings: AppSettings
  onUpdate: (patch: Partial<AppSettings>) => void
  onReset: () => void
}

// @group Utilities > Styles : Shared style tokens
const sectionTitle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
  color: 'var(--color-muted-foreground)', textTransform: 'uppercase',
  marginBottom: 12, marginTop: 0,
}

const card: React.CSSProperties = {
  background: 'var(--color-card)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  padding: '18px 20px',
  marginBottom: 16,
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 0',
  borderBottom: '1px solid var(--color-border)',
}

const lastRowStyle: React.CSSProperties = {
  ...rowStyle,
  borderBottom: 'none',
  paddingBottom: 0,
}

const labelStyle: React.CSSProperties = {
  fontSize: 13, fontWeight: 500, color: 'var(--color-foreground)',
}

const descStyle: React.CSSProperties = {
  fontSize: 11, color: 'var(--color-muted-foreground)', marginTop: 2,
}

// @group BusinessLogic > Toggle : iOS-style toggle switch
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 40, height: 22,
        borderRadius: 11,
        border: 'none',
        cursor: 'pointer',
        background: checked ? 'var(--color-primary)' : 'var(--color-border)',
        position: 'relative',
        transition: 'background 0.2s',
        flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute',
        top: 3, left: checked ? 20 : 3,
        width: 16, height: 16,
        borderRadius: '50%',
        background: '#fff',
        transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
      }} />
    </button>
  )
}

// @group BusinessLogic > SettingRow : A single setting row with label, description, and control
function SettingRow({
  label, description, control, isLast = false,
}: {
  label: string
  description?: React.ReactNode
  control: React.ReactNode
  isLast?: boolean
}) {
  return (
    <div style={isLast ? lastRowStyle : rowStyle}>
      <div style={{ flex: 1, paddingRight: 24 }}>
        <div style={labelStyle}>{label}</div>
        {description && <div style={descStyle}>{description}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{control}</div>
    </div>
  )
}

// @group Utilities > CopyPath : Path display field with one-click copy
function CopyPath({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }).catch(() => {})
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <code style={{
        fontSize: 11, fontFamily: 'monospace',
        background: 'var(--color-muted)', border: '1px solid var(--color-border)',
        borderRadius: 4, padding: '3px 8px',
        color: 'var(--color-foreground)', maxWidth: 340,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        display: 'block',
      }} title={value}>{value}</code>
      <button onClick={copy} title="Copy path" style={{
        padding: 4, background: 'transparent', border: 'none',
        cursor: 'pointer', color: copied ? 'var(--color-status-running)' : 'var(--color-muted-foreground)',
        display: 'flex', alignItems: 'center',
      }}>
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
    </div>
  )
}

// @group BusinessLogic > SettingsPage : Main settings page component
export default function SettingsPage({ settings, onUpdate, onReset }: Props) {
  const isDefault = JSON.stringify(settings) === JSON.stringify(DEFAULT_SETTINGS)
  const [sysPaths, setSysPaths] = useState<{ data_dir: string; log_dir: string } | null>(null)

  // @group BusinessLogic > AI : Core settings state
  const [aiEnabled, setAiEnabled] = useState(false)
  const [aiModel, setAiModel] = useState('gpt-4o-mini')
  const [aiClientId, setAiClientId] = useState('')
  const [aiSaving, setAiSaving] = useState(false)
  const [aiSaved, setAiSaved] = useState(false)

  // @group BusinessLogic > AI : OAuth flow state machine
  const [authPhase, setAuthPhase] = useState<'idle' | 'in_progress' | 'connected'>('idle')
  const [authUsername, setAuthUsername] = useState('')
  const [deviceUserCode, setDeviceUserCode] = useState('')
  const [deviceUri, setDeviceUri] = useState('')
  const [pollInterval, setPollInterval] = useState(5)
  const [codeCopied, setCodeCopied] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // @group BusinessLogic > AI : Dynamic model list from GitHub catalog
  const [modelOptions, setModelOptions] = useState<AiModelInfo[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)

  // @group BusinessLogic > AI : Load initial settings + models on mount
  useEffect(() => {
    api.getSystemPaths().then(setSysPaths).catch(() => {})
  }, [])

  useEffect(() => {
    api.aiGetSettings().then(s => {
      setAiEnabled(s.enabled)
      setAiModel(s.model)
      setAiClientId('') // don't pre-fill client_id; show asterisks if set
      if (s.github_username) {
        setAuthUsername(s.github_username)
        setAuthPhase('connected')
      } else {
        setAuthPhase('idle')
      }
      // Load models if token is available
      if (s.github_token_set) loadModels()
    }).catch(() => {})
  }, [])

  // @group BusinessLogic > AI : Poll GitHub token exchange during Device Flow
  useEffect(() => {
    if (authPhase !== 'in_progress') {
      if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null }
      return
    }
    pollTimerRef.current = setInterval(async () => {
      try {
        const status = await api.aiAuthStatus()
        if (status.status === 'complete' && status.username) {
          setAuthPhase('connected')
          setAuthUsername(status.username)
          setAuthError(null)
          loadModels()
        } else if (status.status === 'expired') {
          setAuthPhase('idle')
          setAuthError('Code expired — please try again.')
        } else if (status.status === 'denied') {
          setAuthPhase('idle')
          setAuthError('Authorization denied by GitHub.')
        } else if (status.status === 'error') {
          setAuthPhase('idle')
          setAuthError(status.message ?? 'Unknown error from GitHub.')
        } else if (status.interval) {
          // GitHub asked to slow down — update timer
          setPollInterval(status.interval)
        }
      } catch { /* network hiccup — keep polling */ }
    }, pollInterval * 1000)

    return () => { if (pollTimerRef.current) clearInterval(pollTimerRef.current) }
  }, [authPhase, pollInterval])

  async function loadModels() {
    setModelsLoading(true)
    try {
      const data = await api.aiGetModels()
      if (data.models.length > 0) setModelOptions(data.models)
    } catch { /* use fallback hardcoded list */ } finally {
      setModelsLoading(false)
    }
  }

  async function saveAiSettings() {
    setAiSaving(true)
    try {
      await api.aiSaveSettings({
        enabled: aiEnabled,
        model: aiModel,
        client_id: aiClientId || undefined,
      })
      setAiSaved(true)
      setTimeout(() => setAiSaved(false), 2000)
      // Reload settings to reflect any server-side normalisation
      const s = await api.aiGetSettings()
      if (s.github_token_set && modelOptions.length === 0) loadModels()
    } catch { /* ignore */ } finally {
      setAiSaving(false)
    }
  }

  async function startDeviceFlow() {
    setAuthError(null)
    try {
      const data = await api.aiAuthStart()
      setDeviceUserCode(data.user_code)
      setDeviceUri(data.verification_uri)
      setPollInterval(data.interval)
      setAuthPhase('in_progress')
    } catch (e: unknown) {
      setAuthError((e as Error)?.message ?? 'Failed to start GitHub login.')
    }
  }

  function cancelDeviceFlow() {
    setAuthPhase('idle')
    setDeviceUserCode('')
    setDeviceUri('')
    setAuthError(null)
  }

  async function disconnect() {
    try {
      await api.aiAuthLogout()
      setAuthPhase('idle')
      setAuthUsername('')
      setModelOptions([])
      setAuthError(null)
    } catch { /* ignore */ }
  }

  function copyDeviceCode() {
    navigator.clipboard.writeText(deviceUserCode).then(() => {
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 2000)
    }).catch(() => {})
  }

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    width: 'auto',
    minWidth: 130,
    fontSize: 12,
    padding: '5px 10px',
    cursor: 'pointer',
  }

  return (
    <div style={{ padding: '20px 28px' }}>

      {/* Header */}
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Settings</h2>
          <p style={{ fontSize: 13, color: 'var(--color-muted-foreground)', marginTop: 4 }}>
            Preferences saved locally in your browser.
          </p>
        </div>
        {!isDefault && (
          <button
            type="button"
            onClick={onReset}
            style={{
              padding: '6px 14px', fontSize: 12,
              background: 'transparent',
              border: '1px solid var(--color-destructive)',
              borderRadius: 5, cursor: 'pointer',
              color: 'var(--color-destructive)',
            }}
          >
            Reset to defaults
          </button>
        )}
      </div>

      {/* ── Section: Polling ── */}
      <p style={sectionTitle}>Polling &amp; Refresh</p>
      <div style={card}>
        <SettingRow
          label="Auto-refresh"
          description="Automatically poll the daemon for process updates."
          control={
            <Toggle
              checked={settings.autoRefresh}
              onChange={v => onUpdate({ autoRefresh: v })}
            />
          }
        />
        <SettingRow
          label="Process refresh interval"
          description="How often the process list is refreshed."
          control={
            <select
              value={settings.processRefreshInterval}
              onChange={e => onUpdate({ processRefreshInterval: Number(e.target.value) })}
              disabled={!settings.autoRefresh}
              style={{ ...selectStyle, opacity: settings.autoRefresh ? 1 : 0.4 }}
            >
              {REFRESH_INTERVAL_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          }
        />
        <SettingRow
          label="Health check interval"
          description="How often the daemon status in the sidebar is polled."
          isLast
          control={
            <select
              value={settings.healthRefreshInterval}
              onChange={e => onUpdate({ healthRefreshInterval: Number(e.target.value) })}
              style={selectStyle}
            >
              {REFRESH_INTERVAL_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          }
        />
      </div>

      {/* ── Section: Behaviour ── */}
      <p style={sectionTitle}>Behaviour</p>
      <div style={card}>
        <SettingRow
          label="Confirm before delete"
          description="Show a confirmation dialog when deleting a process."
          control={
            <Toggle
              checked={settings.confirmBeforeDelete}
              onChange={v => onUpdate({ confirmBeforeDelete: v })}
            />
          }
        />
        <SettingRow
          label="Confirm before shutdown"
          description="Show a confirmation dialog when shutting down the daemon."
          isLast
          control={
            <Toggle
              checked={settings.confirmBeforeShutdown}
              onChange={v => onUpdate({ confirmBeforeShutdown: v })}
            />
          }
        />
      </div>

      {/* ── Section: Logs ── */}
      <p style={sectionTitle}>Log Viewer</p>
      <div style={card}>
        <SettingRow
          label="Default tail lines"
          description="Number of log lines to fetch when opening a process log view."
          isLast
          control={
            <select
              value={settings.logTailLines}
              onChange={e => onUpdate({ logTailLines: Number(e.target.value) })}
              style={selectStyle}
            >
              {LOG_TAIL_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          }
        />
      </div>

      {/* ── Section: Defaults ── */}
      <p style={sectionTitle}>Process Defaults</p>
      <div style={card}>
        <SettingRow
          label="Default namespace"
          description="Pre-filled namespace when creating new processes or cron jobs."
          isLast
          control={
            <input
              style={{ ...inputStyle, width: 140, fontSize: 12, padding: '5px 10px' }}
              value={settings.defaultNamespace}
              onChange={e => onUpdate({ defaultNamespace: e.target.value })}
              placeholder="default"
              spellCheck={false}
            />
          }
        />
      </div>

      {/* ── Section: Storage ── */}
      <p style={sectionTitle}>Storage</p>
      <div style={card}>
        <SettingRow
          label="Data directory"
          description="Root folder where alter stores state, PID, and daemon logs."
          control={sysPaths ? <CopyPath value={sysPaths.data_dir} /> : <span style={{ fontSize: 11, color: 'var(--color-muted-foreground)' }}>loading…</span>}
        />
        <SettingRow
          label="Log directory"
          description={<>Where process stdout/stderr logs are written. Override with <code style={{ fontSize: 10, fontFamily: 'monospace' }}>ALTER_LOG_DIR</code> env var.</>}
          isLast
          control={sysPaths ? <CopyPath value={sysPaths.log_dir} /> : <span style={{ fontSize: 11, color: 'var(--color-muted-foreground)' }}>loading…</span>}
        />
      </div>

      {/* ── Section: Connection ── */}
      <p style={sectionTitle}>Connection</p>
      <div style={card}>
        <SettingRow
          label="Daemon URL"
          description="Base URL of the alter daemon. Change if running remotely."
          isLast
          control={
            <input
              style={{ ...inputStyle, width: 200, fontSize: 12, padding: '5px 10px', fontFamily: 'monospace' }}
              value={settings.daemonUrl}
              onChange={e => onUpdate({ daemonUrl: e.target.value })}
              placeholder="http://127.0.0.1:2999"
              spellCheck={false}
            />
          }
        />
      </div>

      {/* ── Section: AI Assistant ── */}
      <p style={sectionTitle}>AI Assistant</p>
      <div style={card}>

        {/* Enable toggle */}
        <SettingRow
          label="Enable AI assistant"
          description="Show the AI panel button in the sidebar."
          control={<Toggle checked={aiEnabled} onChange={setAiEnabled} />}
        />

        {/* GitHub OAuth App Client ID */}
        <SettingRow
          label="GitHub OAuth App Client ID"
          description={
            <>
              Create an OAuth App at{' '}
              <a href="https://github.com/settings/developers" target="_blank" rel="noreferrer"
                style={{ color: 'var(--color-primary)', textDecoration: 'none' }}>
                github.com/settings/developers
              </a>
              {' '}and enable "Device Flow". Paste the Client ID here (no secret needed).
            </>
          }
          control={
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="text"
                value={aiClientId}
                onChange={e => setAiClientId(e.target.value)}
                placeholder="Oauth_…"
                style={{ ...inputStyle, width: 180, fontSize: 12, padding: '5px 10px', fontFamily: 'monospace' }}
                spellCheck={false}
                autoComplete="off"
              />
              <button
                onClick={saveAiSettings}
                disabled={aiSaving}
                style={{
                  padding: '5px 14px', fontSize: 12, fontWeight: 500,
                  background: aiSaved ? 'var(--color-status-running)' : 'var(--color-primary)',
                  color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer',
                  opacity: aiSaving ? 0.6 : 1, transition: 'background 0.2s',
                }}
              >
                {aiSaved ? 'Saved!' : aiSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          }
        />

        {/* GitHub Sign-in / Status */}
        <SettingRow
          label="GitHub account"
          description="Sign in to let alter fetch an access token automatically via GitHub OAuth."
          control={
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>

              {/* idle — not connected */}
              {authPhase === 'idle' && (
                <button
                  onClick={startDeviceFlow}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '6px 14px', fontSize: 12, fontWeight: 500,
                    background: 'var(--color-foreground)', color: 'var(--color-background)',
                    border: 'none', borderRadius: 5, cursor: 'pointer',
                    opacity: 1, transition: 'opacity 0.15s',
                  }}
                >
                  <Github size={13} /> Sign in with GitHub
                </button>
              )}

              {/* in_progress — showing device code */}
              {authPhase === 'in_progress' && (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6,
                  padding: '10px 12px',
                  background: 'var(--color-accent)',
                  borderRadius: 8,
                  border: '1px solid var(--color-border)',
                  minWidth: 230,
                }}>
                  <div style={{ fontSize: 11, color: 'var(--color-muted-foreground)', alignSelf: 'flex-start' }}>
                    Enter this code at:
                  </div>
                  <div style={{ alignSelf: 'flex-start' }}>
                    <a
                      href={deviceUri || 'https://github.com/login/device'}
                      target="_blank" rel="noreferrer"
                      style={{ fontSize: 11, color: 'var(--color-primary)', textDecoration: 'none' }}
                    >
                      {deviceUri || 'github.com/login/device'} ↗
                    </a>
                  </div>
                  {/* Big copyable code */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'flex-start' }}>
                    <code style={{
                      fontSize: 22, fontWeight: 700, fontFamily: 'monospace', letterSpacing: '0.12em',
                      color: 'var(--color-foreground)',
                    }}>
                      {deviceUserCode}
                    </code>
                    <button
                      onClick={copyDeviceCode}
                      title="Copy code"
                      style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        color: codeCopied ? 'var(--color-status-running)' : 'var(--color-muted-foreground)',
                        display: 'flex', alignItems: 'center',
                      }}
                    >
                      {codeCopied ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'flex-start' }}>
                    <Loader size={12} style={{ animation: 'spin 1s linear infinite', color: 'var(--color-muted-foreground)' }} />
                    <span style={{ fontSize: 11, color: 'var(--color-muted-foreground)' }}>Waiting for authorization…</span>
                  </div>
                  <button
                    onClick={cancelDeviceFlow}
                    style={{
                      alignSelf: 'flex-start', padding: '4px 10px', fontSize: 11,
                      background: 'transparent', border: '1px solid var(--color-border)',
                      borderRadius: 4, cursor: 'pointer', color: 'var(--color-muted-foreground)',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* connected */}
              {authPhase === 'connected' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, color: 'var(--color-status-running)', fontWeight: 500 }}>
                    ✓ Connected as @{authUsername}
                  </span>
                  <button
                    onClick={disconnect}
                    title="Disconnect GitHub account"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '4px 10px', fontSize: 11,
                      background: 'transparent',
                      border: '1px solid var(--color-border)',
                      borderRadius: 4, cursor: 'pointer',
                      color: 'var(--color-muted-foreground)',
                    }}
                  >
                    <LogOut size={11} /> Disconnect
                  </button>
                </div>
              )}

              {/* auth error */}
              {authError && (
                <div style={{ fontSize: 11, color: 'var(--color-destructive)', maxWidth: 240, textAlign: 'right' }}>
                  {authError}
                </div>
              )}
            </div>
          }
        />

        {/* Model dropdown — dynamic or fallback */}
        <SettingRow
          label="Model"
          description="GitHub Models model to use for chat responses."
          isLast
          control={
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <select
                value={aiModel}
                onChange={e => setAiModel(e.target.value)}
                style={{ ...selectStyle, minWidth: 180 }}
              >
                {modelOptions.length > 0
                  ? modelOptions.map(m => (
                    <option key={m.id} value={m.id} title={m.summary}>
                      {m.name}{m.publisher ? ` (${m.publisher})` : ''}
                    </option>
                  ))
                  : (
                    <>
                      <option value="gpt-4o-mini">gpt-4o-mini (fast)</option>
                      <option value="gpt-4o">gpt-4o</option>
                      <option value="o3-mini">o3-mini</option>
                      <option value="claude-3-5-sonnet">claude-3-5-sonnet</option>
                    </>
                  )
                }
              </select>
              <button
                onClick={loadModels}
                disabled={modelsLoading}
                title="Refresh model list from GitHub"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 28, height: 28, borderRadius: 5,
                  background: 'transparent', border: '1px solid var(--color-border)',
                  cursor: 'pointer', color: 'var(--color-muted-foreground)',
                }}
              >
                <RefreshCw size={12} style={modelsLoading ? { animation: 'spin 1s linear infinite' } : {}} />
              </button>
              <button
                onClick={saveAiSettings}
                disabled={aiSaving}
                style={{
                  padding: '5px 14px', fontSize: 12, fontWeight: 500,
                  background: aiSaved ? 'var(--color-status-running)' : 'var(--color-primary)',
                  color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer',
                  opacity: aiSaving ? 0.6 : 1, transition: 'background 0.2s',
                }}
              >
                {aiSaved ? 'Saved!' : aiSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          }
        />
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {/* Footer note */}
      <p style={{ fontSize: 11, color: 'var(--color-muted-foreground)', textAlign: 'center', marginTop: 8 }}>
        Settings are stored in your browser's localStorage and apply to this machine only.
        {' '}Changes take effect immediately.
      </p>
    </div>
  )
}
