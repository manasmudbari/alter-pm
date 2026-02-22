// @group BusinessLogic : Cron expression input with presets + live preview

import { useState } from 'react'

// @group BusinessLogic > Presets : Common cron schedule presets
const PRESETS = [
  { label: 'Every minute',    value: '* * * * *' },
  { label: 'Every 5 minutes', value: '*/5 * * * *' },
  { label: 'Every 15 minutes',value: '*/15 * * * *' },
  { label: 'Every 30 minutes',value: '*/30 * * * *' },
  { label: 'Hourly',          value: '0 * * * *' },
  { label: 'Daily at midnight',value: '0 0 * * *' },
  { label: 'Daily at noon',   value: '0 12 * * *' },
  { label: 'Weekly (Monday)', value: '0 9 * * 1' },
  { label: 'Monthly (1st)',   value: '0 0 1 * *' },
]

// @group Utilities > CronParser : Compute next N run times from a 5-field cron expression
function getNextRuns(expr: string, count = 3): Date[] {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return []
  const [minPart, hourPart, domPart, monthPart, dowPart] = parts

  function matches(val: number, field: string, min: number, _max: number): boolean {
    if (field === '*') return true
    for (const seg of field.split(',')) {
      if (seg.includes('/')) {
        const [rangeStr, stepStr] = seg.split('/')
        const step = parseInt(stepStr)
        if (isNaN(step)) return false
        const start = rangeStr === '*' ? min : parseInt(rangeStr)
        if (!isNaN(start) && val >= start && (val - start) % step === 0) return true
      } else if (seg.includes('-')) {
        const [lo, hi] = seg.split('-').map(Number)
        if (val >= lo && val <= hi) return true
      } else {
        if (parseInt(seg) === val) return true
      }
    }
    return false
  }

  const runs: Date[] = []
  const now = new Date()
  // Start one minute ahead to avoid showing "now"
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes() + 1, 0, 0)

  let iterations = 0
  while (runs.length < count && iterations < 100000) {
    iterations++
    const min   = cursor.getMinutes()
    const hour  = cursor.getHours()
    const dom   = cursor.getDate()
    const month = cursor.getMonth() + 1
    const dow   = cursor.getDay() // 0=Sun

    if (
      matches(month, monthPart, 1, 12) &&
      matches(dom, domPart, 1, 31) &&
      matches(dow, dowPart, 0, 6) &&
      matches(hour, hourPart, 0, 23) &&
      matches(min, minPart, 0, 59)
    ) {
      runs.push(new Date(cursor))
    }
    cursor.setMinutes(cursor.getMinutes() + 1)
  }
  return runs
}

// @group Utilities > CronDescription : Human-readable description of a cron expression
function describe(expr: string): string {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return 'Invalid expression'
  const [min, hour, dom, month, dow] = parts

  if (expr === '* * * * *') return 'Every minute'
  if (min.startsWith('*/') && hour === '*' && dom === '*' && month === '*' && dow === '*') {
    return `Every ${min.slice(2)} minutes`
  }
  if (min === '0' && hour === '*' && dom === '*' && month === '*' && dow === '*') return 'Every hour at :00'
  if (min !== '*' && hour !== '*' && dom === '*' && month === '*' && dow === '*') {
    return `Daily at ${hour.padStart(2,'0')}:${min.padStart(2,'0')}`
  }
  if (min !== '*' && hour !== '*' && dom === '*' && month === '*' && dow !== '*') {
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
    const dayName = days[parseInt(dow)] ?? `day ${dow}`
    return `Every ${dayName} at ${hour.padStart(2,'0')}:${min.padStart(2,'0')}`
  }
  if (min !== '*' && hour !== '*' && dom !== '*' && month === '*' && dow === '*') {
    return `Monthly on day ${dom} at ${hour.padStart(2,'0')}:${min.padStart(2,'0')}`
  }
  return `${min} ${hour} ${dom} ${month} ${dow}`
}

interface Props {
  value: string
  onChange: (v: string) => void
  style?: React.CSSProperties
}

export function CronExpressionInput({ value, onChange, style }: Props) {
  const [showPresets, setShowPresets] = useState(false)

  const nextRuns = getNextRuns(value)
  const description = value.trim() ? describe(value) : ''
  const isValid = value.trim() !== '' && getNextRuns(value).length > 0

  return (
    <div style={style}>
      {/* Input row */}
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="* * * * *  (min hr dom mon dow)"
          style={{
            flex: 1, padding: '7px 10px', fontSize: 13,
            background: 'var(--color-muted)', border: `1px solid ${isValid || !value ? 'var(--color-border)' : 'var(--color-destructive)'}`,
            borderRadius: 5, color: 'var(--color-foreground)',
            fontFamily: 'monospace',
          }}
        />
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setShowPresets(s => !s)}
            style={{
              padding: '7px 10px', fontSize: 12, whiteSpace: 'nowrap',
              background: 'var(--color-secondary)', border: '1px solid var(--color-border)',
              borderRadius: 5, cursor: 'pointer', color: 'var(--color-foreground)',
            }}
          >
            Presets ▾
          </button>
          {showPresets && (
            <div style={{
              position: 'absolute', top: '110%', right: 0, zIndex: 100,
              background: 'var(--color-card)', border: '1px solid var(--color-border)',
              borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,0.4)', minWidth: 200,
            }}>
              {PRESETS.map(p => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => { onChange(p.value); setShowPresets(false) }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '7px 14px', fontSize: 12, background: 'transparent',
                    border: 'none', cursor: 'pointer', color: 'var(--color-foreground)',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-accent)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ fontWeight: 600 }}>{p.label}</span>
                  <span style={{ marginLeft: 8, color: 'var(--color-muted-foreground)', fontFamily: 'monospace', fontSize: 11 }}>{p.value}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Preview */}
      {value.trim() && (
        <div style={{ marginTop: 8, padding: '8px 10px', background: 'var(--color-muted)', borderRadius: 5, fontSize: 12 }}>
          {isValid ? (
            <>
              <div style={{ color: 'var(--color-status-running)', fontWeight: 600, marginBottom: 4 }}>{description}</div>
              <div style={{ color: 'var(--color-muted-foreground)' }}>
                Next runs: {nextRuns.map(d => d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })).join('  ·  ')}
              </div>
            </>
          ) : (
            <div style={{ color: 'var(--color-destructive)' }}>Invalid cron expression</div>
          )}
        </div>
      )}
    </div>
  )
}
