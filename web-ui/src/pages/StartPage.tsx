// @group BusinessLogic : Start new process form

import { useRef, useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { api } from '@/lib/api'
import { parseArgs, parseEnvString } from '@/lib/utils'
import { FormCard, FormField, FormRow } from '@/components/FormLayout'
import { FolderBrowser } from '@/components/FolderBrowser'
import type { AppSettings } from '@/lib/settings'

interface Props {
  onDone: () => void
  settings: AppSettings
}

export default function StartPage({ onDone, settings }: Props) {
  const [script, setScript]         = useState('')
  const [name, setName]             = useState('')
  const [cwd, setCwd]               = useState('')
  const [namespace, setNamespace]   = useState(settings.defaultNamespace || 'default')
  const [args, setArgs]             = useState('')
  const [env, setEnv]               = useState('')
  const [autorestart, setAutorestart] = useState(true)
  const [watch, setWatch]           = useState(false)
  const [cron, setCron]             = useState('')
  const [error, setError]           = useState('')
  const [loading, setLoading]       = useState(false)
  const [envStatus, setEnvStatus]   = useState<{ exists: boolean } | null>(null)
  const [browseOpen, setBrowseOpen] = useState(false)
  const envCheckTimer               = useRef<ReturnType<typeof setTimeout> | null>(null)

  // @group BusinessLogic > EnvCheck : Debounced .env existence check when cwd changes
  function handleCwdChange(val: string) {
    setCwd(val)
    setEnvStatus(null)
    if (envCheckTimer.current) clearTimeout(envCheckTimer.current)
    const trimmed = val.trim()
    if (!trimmed) return
    envCheckTimer.current = setTimeout(() => {
      api.checkEnvPath(trimmed)
        .then(r => setEnvStatus({ exists: r.exists }))
        .catch(() => {})
    }, 500)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const cronVal = cron.trim() || undefined
      await api.startProcess({
        script: script.trim(),
        ...(name.trim()      && { name: name.trim() }),
        ...(cwd.trim()       && { cwd: cwd.trim() }),
        ...(namespace.trim() && { namespace: namespace.trim() }),
        ...(args.trim()      && { args: parseArgs(args.trim()) }),
        ...(env.trim()       && { env: parseEnvString(env.trim()) }),
        autorestart,
        watch,
        ...(cronVal && { cron: cronVal }),
      })
      onDone()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to start process')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: '20px 24px' }}>
      {browseOpen && (
        <FolderBrowser
          initialPath={cwd.trim()}
          onSelect={path => handleCwdChange(path)}
          onClose={() => setBrowseOpen(false)}
        />
      )}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>Start New Process</h2>
      </div>

      <FormCard onSubmit={handleSubmit}>
        <FormRow>
          <FormField label="Command *">
            <input style={inputStyle} value={script} onChange={e => setScript(e.target.value)}
              placeholder="node app.js" required />
          </FormField>
          <FormField label="Name">
            <input style={inputStyle} value={name} onChange={e => setName(e.target.value)}
              placeholder="my-app" />
          </FormField>
        </FormRow>
        <FormRow>
          <FormField label={
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              Working Directory
              {envStatus !== null && (
                <span style={{
                  fontSize: 10, padding: '1px 6px', borderRadius: 4, fontWeight: 500,
                  background: envStatus.exists ? 'rgba(100,200,100,0.15)' : 'rgba(128,128,128,0.1)',
                  color: envStatus.exists ? 'var(--color-status-running, #4ade80)' : 'var(--color-muted-foreground)',
                }}>
                  {envStatus.exists ? '● .env found' : '○ no .env'}
                </span>
              )}
            </span>
          }>
            <div style={{ display: 'flex', gap: 6 }}>
              <input style={{ ...inputStyle, flex: 1 }} value={cwd} onChange={e => handleCwdChange(e.target.value)}
                placeholder="C:\Users\me\app" />
              <button type="button" onClick={() => setBrowseOpen(true)} title="Browse folders" style={browseBtnStyle}>
                <FolderOpen size={14} strokeWidth={1.75} />
              </button>
            </div>
          </FormField>
          <FormField label="Namespace">
            <input style={inputStyle} value={namespace} onChange={e => setNamespace(e.target.value)}
              placeholder="default" />
          </FormField>
        </FormRow>
        <FormRow>
          <FormField label="Args (space-separated)">
            <input style={inputStyle} value={args} onChange={e => setArgs(e.target.value)}
              placeholder="--port 3000 --env prod" />
          </FormField>
          <FormField label="Env Vars (KEY=VAL, comma-separated)">
            <input style={inputStyle} value={env} onChange={e => setEnv(e.target.value)}
              placeholder="NODE_ENV=production,PORT=3000" />
          </FormField>
        </FormRow>
        <FormRow>
          <FormField label="">
            <div style={{ display: 'flex', gap: 20, marginTop: 4 }}>
              <CheckboxField label="Auto-restart on crash" checked={autorestart} onChange={setAutorestart} />
              <CheckboxField label="Watch mode" checked={watch} onChange={setWatch} />
            </div>
          </FormField>
          <FormField label={<>Cron Schedule <span style={{ color: 'var(--color-muted-foreground)', fontSize: 11 }}>(e.g. "0 * * * *" — leave blank for normal)</span></>}>
            <input style={inputStyle} value={cron} onChange={e => setCron(e.target.value)}
              placeholder="0 * * * *" />
          </FormField>
        </FormRow>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
          <button type="submit" disabled={loading} style={primaryBtnStyle}>
            {loading ? 'Starting…' : '▶ Start'}
          </button>
          {error && <span style={{ fontSize: 12, color: 'var(--color-destructive)' }}>{error}</span>}
        </div>
      </FormCard>
    </div>
  )
}

function CheckboxField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        style={{ accentColor: 'var(--color-primary)', width: 14, height: 14 }} />
      {label}
    </label>
  )
}

export const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 10px', fontSize: 13,
  background: 'var(--color-input)', border: '1px solid var(--color-border)',
  borderRadius: 5, color: 'var(--color-foreground)', outline: 'none',
}

export const primaryBtnStyle: React.CSSProperties = {
  padding: '7px 20px', fontSize: 13, fontWeight: 600,
  background: 'var(--color-primary)', border: 'none',
  borderRadius: 5, cursor: 'pointer', color: '#fff',
}

export const browseBtnStyle: React.CSSProperties = {
  padding: '0 10px', flexShrink: 0, height: '100%', minHeight: 32,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'var(--color-secondary)', border: '1px solid var(--color-border)',
  borderRadius: 5, cursor: 'pointer', color: 'var(--color-muted-foreground)',
}
