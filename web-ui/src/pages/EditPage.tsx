// @group BusinessLogic : Edit process configuration form

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { parseArgs, parseEnvString } from '@/lib/utils'
import { FormCard, FormField, FormRow } from '@/components/FormLayout'
import { inputStyle, primaryBtnStyle } from './StartPage'

interface Props {
  onDone: () => void
}

export default function EditPage({ onDone }: Props) {
  const { id } = useParams<{ id: string }>()
  const [script, setScript]         = useState('')
  const [name, setName]             = useState('')
  const [cwd, setCwd]               = useState('')
  const [namespace, setNamespace]   = useState('default')
  const [argsStr, setArgsStr]       = useState('')
  const [envStr, setEnvStr]         = useState('')
  const [autorestart, setAutorestart] = useState(true)
  const [watch, setWatch]           = useState(false)
  const [cron, setCron]             = useState('')
  const [maxRestarts, setMaxRestarts] = useState(10)
  const [error, setError]           = useState('')
  const [loading, setLoading]       = useState(false)
  const [loaded, setLoaded]         = useState(false)

  useEffect(() => {
    if (!id) return
    api.getProcess(id).then(p => {
      setScript(p.script || '')
      setName(p.name || '')
      setCwd(p.cwd || '')
      setNamespace(p.namespace || 'default')
      setArgsStr((p.args || []).join(' '))
      setEnvStr(Object.entries((p as any).env || {}).map(([k, v]) => `${k}=${v}`).join(','))
      setAutorestart(!!p.autorestart)
      setWatch(!!p.watch)
      setCron(p.cron || '')
      setMaxRestarts(p.max_restarts ?? 10)
      setLoaded(true)
    }).catch(() => setError('Failed to load process config'))
  }, [id])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!id) return
    setError('')
    setLoading(true)
    try {
      const cronVal = cron.trim() || undefined
      await api.updateProcess(id, {
        script: script.trim(),
        ...(name.trim()      && { name: name.trim() }),
        ...(cwd.trim()       && { cwd: cwd.trim() }),
        namespace: namespace.trim() || 'default',
        ...(argsStr.trim()   && { args: parseArgs(argsStr.trim()) }),
        ...(envStr.trim()    && { env: parseEnvString(envStr.trim()) }),
        autorestart,
        watch,
        max_restarts: maxRestarts,
        ...(cronVal && { cron: cronVal }),
      })
      onDone()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update process')
    } finally {
      setLoading(false)
    }
  }

  if (!loaded && !error) return <div style={{ padding: 24, color: 'var(--color-muted-foreground)' }}>Loading…</div>

  return (
    <div style={{ padding: '20px 24px' }}>
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>Edit Process</h2>
        <button onClick={onDone} style={{ fontSize: 12, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-muted-foreground)' }}>
          ← Back
        </button>
      </div>

      <FormCard onSubmit={handleSubmit}>
        <FormRow>
          <FormField label="Command *">
            <input style={inputStyle} value={script} onChange={e => setScript(e.target.value)} required />
          </FormField>
          <FormField label="Name">
            <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} />
          </FormField>
        </FormRow>
        <FormRow>
          <FormField label="Working Directory">
            <input style={inputStyle} value={cwd} onChange={e => setCwd(e.target.value)} placeholder="C:\Users\me\app" />
          </FormField>
          <FormField label="Args (space-separated)">
            <input style={inputStyle} value={argsStr} onChange={e => setArgsStr(e.target.value)} />
          </FormField>
        </FormRow>
        <FormRow>
          <FormField label="Env Vars (KEY=VAL, comma-separated)">
            <input style={inputStyle} value={envStr} onChange={e => setEnvStr(e.target.value)} />
          </FormField>
          <FormField label="Namespace">
            <input style={inputStyle} value={namespace} onChange={e => setNamespace(e.target.value)} />
          </FormField>
        </FormRow>
        <FormRow>
          <FormField label="Max Restarts">
            <input style={inputStyle} type="number" value={maxRestarts} onChange={e => setMaxRestarts(parseInt(e.target.value) || 10)} />
          </FormField>
          <FormField label={<>Cron Schedule <span style={{ color: 'var(--color-muted-foreground)', fontSize: 11 }}>(leave blank to disable)</span></>}>
            <input style={inputStyle} value={cron} onChange={e => setCron(e.target.value)} placeholder="0 * * * *" />
          </FormField>
        </FormRow>
        <FormRow>
          <FormField label="">
            <div style={{ display: 'flex', gap: 20, marginTop: 4 }}>
              <CheckboxField label="Auto-restart on crash" checked={autorestart} onChange={setAutorestart} />
              <CheckboxField label="Watch mode" checked={watch} onChange={setWatch} />
            </div>
          </FormField>
          <div />
        </FormRow>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
          <button type="submit" disabled={loading} style={primaryBtnStyle}>
            {loading ? 'Saving…' : '💾 Save & Apply'}
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
