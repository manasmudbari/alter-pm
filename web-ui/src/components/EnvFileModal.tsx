// @group BusinessLogic : .env file viewer and editor modal
// Reads and writes cwd/.env for a process; offers Save or Save & Restart.

import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'

interface Props {
  processId: string
  processName: string
  onClose: () => void
  onRestart: () => void
}

export function EnvFileModal({ processId, processName, onClose, onRestart }: Props) {
  const [content, setContent]   = useState('')
  const [exists, setExists]     = useState(false)
  const [filePath, setFilePath] = useState('')
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [dirty, setDirty]       = useState(false)
  const [error, setError]       = useState('')
  const textareaRef             = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setLoading(true)
    api.getEnvFile(processId)
      .then(data => {
        setContent(data.content)
        setExists(data.exists)
        setLoading(false)
        setTimeout(() => textareaRef.current?.focus(), 50)
      })
      .catch(e => { setError(String(e.message ?? e)); setLoading(false) })
  }, [processId])

  // @group Utilities : Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  async function handleSave(andRestart: boolean) {
    setSaving(true)
    setError('')
    try {
      const result = await api.saveEnvFile(processId, content)
      setFilePath(result.path)
      setExists(true)
      setDirty(false)
      setSaved(true)
      if (andRestart) {
        await api.restartProcess(processId).catch(() => {})
        onRestart()
        onClose()
      } else {
        setTimeout(() => setSaved(false), 2500)
      }
    } catch (e: any) {
      setError(String(e.message ?? e))
    } finally {
      setSaving(false)
    }
  }

  const lineCount = content.split('\n').length

  return (
    // @group BusinessLogic > Overlay : Modal backdrop — click outside to close
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div style={{
        background: 'var(--color-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        width: 660, maxWidth: '92vw', maxHeight: '82vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      }}>

        {/* Header */}
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <span style={{ fontSize: 15 }}>🔑</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>.env</span>
            <span style={{ marginLeft: 6, fontSize: 13, color: 'var(--color-muted-foreground)' }}>
              — {processName}
            </span>
          </div>
          {!loading && (
            <span style={{
              fontSize: 11, padding: '2px 7px', borderRadius: 4, fontWeight: 500,
              background: exists ? 'rgba(100,200,100,0.15)' : 'rgba(255,100,100,0.12)',
              color: exists ? 'var(--color-status-running, #4ade80)' : 'var(--color-destructive)',
            }}>
              {exists ? '● exists' : '○ no .env'}
            </span>
          )}
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1, color: 'var(--color-muted-foreground)', padding: '0 2px' }}
          >×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '12px 16px', gap: 8 }}>
          {loading ? (
            <div style={{ color: 'var(--color-muted-foreground)', padding: 24, textAlign: 'center', fontSize: 13 }}>
              Loading…
            </div>
          ) : (
            <>
              {!exists && (
                <div style={{
                  fontSize: 12, padding: '7px 10px', borderRadius: 4,
                  background: 'var(--color-muted)', color: 'var(--color-muted-foreground)',
                  borderLeft: '3px solid var(--color-border)',
                }}>
                  No <code>.env</code> file found in this process's working directory. Saving will create it.
                </div>
              )}

              {/* Editor */}
              <div style={{ flex: 1, display: 'flex', gap: 0, border: `1px solid ${dirty ? 'var(--color-primary)' : 'var(--color-border)'}`, borderRadius: 4, overflow: 'hidden', background: 'var(--color-background)' }}>
                {/* Line numbers */}
                <div style={{
                  padding: '10px 8px', textAlign: 'right', userSelect: 'none',
                  fontFamily: 'monospace', fontSize: 12, lineHeight: '1.6',
                  color: 'var(--color-muted-foreground)', background: 'var(--color-muted)',
                  borderRight: '1px solid var(--color-border)', minWidth: 36,
                }}>
                  {Array.from({ length: lineCount }, (_, i) => (
                    <div key={i}>{i + 1}</div>
                  ))}
                </div>
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={e => { setContent(e.target.value); setDirty(true); setSaved(false) }}
                  spellCheck={false}
                  placeholder={'KEY=value\nDATABASE_URL=postgres://...\nSECRET_KEY=...'}
                  style={{
                    flex: 1, padding: '10px 12px',
                    fontFamily: 'monospace', fontSize: 13, lineHeight: '1.6',
                    background: 'transparent', color: 'var(--color-foreground)',
                    border: 'none', outline: 'none', resize: 'none',
                    minHeight: 220,
                  }}
                />
              </div>

              {filePath && (
                <div style={{ fontSize: 11, color: 'var(--color-muted-foreground)', fontFamily: 'monospace' }}>
                  📁 {filePath}
                </div>
              )}
              {error && (
                <div style={{ fontSize: 12, color: 'var(--color-destructive)', padding: '5px 8px', borderRadius: 4, background: 'rgba(255,100,100,0.1)' }}>
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 16px',
          borderTop: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <span style={{ fontSize: 11, color: 'var(--color-muted-foreground)' }}>
            {dirty ? 'Unsaved changes' : saved ? '✓ Saved' : `${lineCount} line${lineCount !== 1 ? 's' : ''}`}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={cancelBtnStyle}>Cancel</button>
            <button
              disabled={saving || loading}
              onClick={() => handleSave(false)}
              style={{ ...cancelBtnStyle, opacity: saving || loading ? 0.6 : 1 }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              disabled={saving || loading}
              onClick={() => handleSave(true)}
              style={{ ...primaryBtnStyle, opacity: saving || loading ? 0.6 : 1 }}
            >
              {saving ? 'Saving…' : 'Save & Restart'}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}

// @group Utilities > Styles
const cancelBtnStyle: React.CSSProperties = {
  padding: '5px 14px', fontSize: 13, cursor: 'pointer',
  background: 'var(--color-secondary)', border: '1px solid var(--color-border)',
  borderRadius: 5, color: 'var(--color-foreground)',
}

const primaryBtnStyle: React.CSSProperties = {
  padding: '5px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  background: 'var(--color-primary)', border: '1px solid var(--color-primary)',
  borderRadius: 5, color: 'var(--color-primary-foreground)',
}
