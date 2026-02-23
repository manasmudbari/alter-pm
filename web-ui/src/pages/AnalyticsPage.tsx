// @group BusinessLogic : Analytics dashboard — process and system metrics

import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { CSSProperties, ReactNode } from 'react'
import { useDaemonHealth } from '@/hooks/useDaemonHealth'
import { formatUptime, statusColor, STATUS_COLORS } from '@/lib/utils'
import type { AppSettings } from '@/lib/settings'
import type { ProcessInfo, ProcessStatus } from '@/types'

// @group Types > Analytics : Derived data structures for analytics view
interface StatusSegment {
  status: ProcessStatus
  count: number
  color: string
  label: string
}

interface NamespaceRow {
  namespace: string
  total: number
  running: number
  stopped: number
  crashed: number
  other: number
}

interface Props {
  processes: ProcessInfo[]
  settings: AppSettings
}

// @group BusinessLogic > AnalyticsPage : Main analytics dashboard page
export default function AnalyticsPage({ processes, settings }: Props) {
  const navigate = useNavigate()
  const health = useDaemonHealth(settings.healthRefreshInterval)

  // @group BusinessLogic > Analytics : Compute all derived metrics from processes list
  const stats = useMemo(() => {
    const byStatus: Partial<Record<ProcessStatus, number>> = {}
    for (const p of processes) {
      byStatus[p.status] = (byStatus[p.status] ?? 0) + 1
    }

    const running  = byStatus['running']  ?? 0
    const stopped  = byStatus['stopped']  ?? 0
    const crashed  = byStatus['crashed']  ?? 0
    const errored  = byStatus['errored']  ?? 0
    const sleeping = byStatus['sleeping'] ?? 0
    const watching = byStatus['watching'] ?? 0
    const starting = byStatus['starting'] ?? 0
    const stopping = byStatus['stopping'] ?? 0
    const total    = processes.length

    // Namespace breakdown
    const nsMap = new Map<string, NamespaceRow>()
    for (const p of processes) {
      const ns = p.namespace || 'default'
      if (!nsMap.has(ns)) nsMap.set(ns, { namespace: ns, total: 0, running: 0, stopped: 0, crashed: 0, other: 0 })
      const row = nsMap.get(ns)!
      row.total++
      if (p.status === 'running' || p.status === 'watching') row.running++
      else if (p.status === 'stopped' || p.status === 'stopping') row.stopped++
      else if (p.status === 'crashed' || p.status === 'errored') row.crashed++
      else row.other++
    }
    const namespaces: NamespaceRow[] = [...nsMap.values()].sort((a, b) =>
      a.namespace === 'default' ? -1 : b.namespace === 'default' ? 1 : a.namespace.localeCompare(b.namespace)
    )

    // Top restarters — non-cron processes with at least 1 restart
    const topRestarters = [...processes]
      .filter(p => p.restart_count > 0 && !p.cron)
      .sort((a, b) => b.restart_count - a.restart_count)
      .slice(0, 8)

    // Longest running active processes
    const longestRunning = [...processes]
      .filter(p => p.status === 'running' && p.uptime_secs !== null)
      .sort((a, b) => (b.uptime_secs ?? 0) - (a.uptime_secs ?? 0))
      .slice(0, 8)

    // Total restarts across all processes
    const totalRestarts = processes.reduce((s, p) => s + p.restart_count, 0)

    // Donut chart segments — skip zero-count statuses
    const statusSegments: StatusSegment[] = ([
      { status: 'running'  as const, count: running + watching, color: STATUS_COLORS.running,  label: 'Running'  },
      { status: 'sleeping' as const, count: sleeping,           color: STATUS_COLORS.sleeping, label: 'Sleeping' },
      { status: 'stopped'  as const, count: stopped + stopping, color: STATUS_COLORS.stopped,  label: 'Stopped'  },
      { status: 'crashed'  as const, count: crashed + errored,  color: STATUS_COLORS.crashed,  label: 'Crashed'  },
      { status: 'starting' as const, count: starting,           color: STATUS_COLORS.starting, label: 'Starting' },
    ] as StatusSegment[]).filter(s => s.count > 0)

    const activeCount = running + watching + sleeping

    return {
      total, running, stopped, crashed, errored, sleeping, watching, starting, stopping,
      totalRestarts, activeCount,
      namespaces, topRestarters, longestRunning, statusSegments,
    }
  }, [processes])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto' }}>

      {/* Page header */}
      <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Analytics</h2>
          <div style={{ fontSize: 12, color: 'var(--color-muted-foreground)', marginTop: 2 }}>
            Process overview and system metrics
          </div>
        </div>
        {health && (
          <span style={{ fontSize: 11, color: 'var(--color-muted-foreground)', background: 'var(--color-secondary)', padding: '3px 10px', borderRadius: 4, border: '1px solid var(--color-border)' }}>
            Daemon v{health.version} · {health.status}
          </span>
        )}
      </div>

      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Row 1: Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
          <StatCard label="Total"    value={stats.total}                        color="var(--color-primary)" />
          <StatCard label="Running"  value={stats.running + stats.watching}     color="var(--color-status-running)"  />
          <StatCard label="Stopped"  value={stats.stopped + stats.stopping}     color="var(--color-status-stopped)"  />
          <StatCard label="Crashed"  value={stats.crashed + stats.errored}      color="var(--color-status-crashed)"  />
          <StatCard label="Sleeping" value={stats.sleeping}                     color="var(--color-status-sleeping)" />
        </div>

        {/* Row 2: Distribution + System Health + Restart Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>

          {/* Status distribution donut */}
          <div style={cardStyle}>
            <div style={cardHeaderStyle}>Status Distribution</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, paddingTop: 6 }}>
              <DonutChart segments={stats.statusSegments} total={stats.total} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 0 }}>
                {stats.statusSegments.length === 0 && (
                  <span style={{ fontSize: 12, color: 'var(--color-muted-foreground)' }}>No processes</span>
                )}
                {stats.statusSegments.map(seg => (
                  <div key={seg.status} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: seg.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, color: 'var(--color-muted-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {seg.label}
                    </span>
                    <span style={{ fontWeight: 600, color: seg.color }}>{seg.count}</span>
                    <span style={{ color: 'var(--color-muted-foreground)', minWidth: 32, textAlign: 'right' }}>
                      {stats.total > 0 ? Math.round((seg.count / stats.total) * 100) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* System health */}
          <div style={cardStyle}>
            <div style={cardHeaderStyle}>System Health</div>
            {health ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 8 }}>
                <HealthRow
                  label="Status"
                  value={health.status}
                  valueColor={health.status === 'running' ? 'var(--color-status-running)' : 'var(--color-status-stopped)'}
                />
                <HealthRow label="Version"    value={`v${health.version}`} />
                <HealthRow label="Uptime"     value={formatUptime(health.uptime_secs)} />
                <HealthRow label="Processes"  value={String(health.process_count)} />
                <HealthRow label="Active"     value={String(stats.activeCount)} valueColor="var(--color-status-running)" />
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--color-muted-foreground)', paddingTop: 8 }}>Connecting…</div>
            )}
          </div>

          {/* Restart summary */}
          <div style={cardStyle}>
            <div style={cardHeaderStyle}>Restart Summary</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 8 }}>
              <HealthRow
                label="Total Restarts"
                value={String(stats.totalRestarts)}
                valueColor={stats.totalRestarts > 0 ? 'var(--color-status-crashed)' : undefined}
              />
              <HealthRow label="Processes w/ Restarts" value={String(processes.filter(p => p.restart_count > 0).length)} />
              <HealthRow label="Avg per Process"       value={stats.total > 0 ? (stats.totalRestarts / stats.total).toFixed(1) : '0'} />
              <HealthRow
                label="AutoRestart On"
                value={String(processes.filter(p => p.autorestart).length)}
                valueColor="var(--color-status-running)"
              />
              <HealthRow label="Watch Mode On"  value={String(processes.filter(p => p.watch).length)} />
            </div>
          </div>
        </div>

        {/* Row 3: Namespace breakdown — only shown when multiple namespaces exist */}
        {stats.namespaces.length > 1 && (
          <div style={cardStyle}>
            <div style={cardHeaderStyle}>Namespace Breakdown</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
              <thead>
                <tr style={{ fontSize: 11, color: 'var(--color-muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 600 }}>Namespace</th>
                  <Th>Total</Th>
                  <Th>Running</Th>
                  <Th>Stopped</Th>
                  <Th>Crashed</Th>
                  <Th>Other</Th>
                </tr>
              </thead>
              <tbody>
                {stats.namespaces.map(ns => (
                  <tr key={ns.namespace} style={{ borderTop: '1px solid var(--color-border)', fontSize: 13 }}>
                    <td style={{ padding: '7px 8px', fontWeight: 500 }}>{ns.namespace}</td>
                    <Td>{ns.total}</Td>
                    <Td color={ns.running > 0 ? 'var(--color-status-running)' : undefined}>{ns.running}</Td>
                    <Td color={ns.stopped > 0 ? 'var(--color-status-stopped)' : undefined}>{ns.stopped}</Td>
                    <Td color={ns.crashed > 0 ? 'var(--color-status-crashed)' : undefined}>{ns.crashed}</Td>
                    <Td>{ns.other}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Row 4: Top Restarters + Longest Running */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

          {/* Top restarters */}
          <div style={cardStyle}>
            <div style={cardHeaderStyle}>Top Restarters</div>
            {stats.topRestarters.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--color-muted-foreground)', paddingTop: 8 }}>No restarts recorded.</div>
            ) : (
              <div style={{ marginTop: 8 }}>
                {stats.topRestarters.map((p, i) => (
                  <ProcessRow
                    key={p.id}
                    label={p.name}
                    sub={p.namespace}
                    dotColor={statusColor(p.status)}
                    rank={i + 1}
                    metric={`${p.restart_count}×`}
                    metricColor="var(--color-status-crashed)"
                    onClick={() => navigate(`/processes/${p.id}`)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Longest running */}
          <div style={cardStyle}>
            <div style={cardHeaderStyle}>Longest Running</div>
            {stats.longestRunning.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--color-muted-foreground)', paddingTop: 8 }}>No running processes.</div>
            ) : (
              <div style={{ marginTop: 8 }}>
                {stats.longestRunning.map((p, i) => (
                  <ProcessRow
                    key={p.id}
                    label={p.name}
                    sub={p.namespace}
                    dotColor="var(--color-status-running)"
                    rank={i + 1}
                    metric={formatUptime(p.uptime_secs ?? 0)}
                    metricColor="var(--color-status-running)"
                    onClick={() => navigate(`/processes/${p.id}`)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Empty state */}
        {processes.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--color-muted-foreground)', padding: '40px 0', fontSize: 14 }}>
            No processes registered. Start a process to see analytics.
          </div>
        )}

      </div>
    </div>
  )
}

// @group BusinessLogic > StatCard : Metric overview card with colored count
function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      background: 'var(--color-card)', border: '1px solid var(--color-border)',
      borderRadius: 8, padding: '14px 16px',
    }}>
      <div style={{ fontSize: 11, color: 'var(--color-muted-foreground)', fontWeight: 600, letterSpacing: '0.06em', marginBottom: 8, textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
    </div>
  )
}

// @group BusinessLogic > DonutChart : SVG donut chart showing process status distribution
function DonutChart({ segments, total }: { segments: StatusSegment[]; total: number }) {
  const r = 50
  const cx = 70
  const cy = 70
  const strokeWidth = 15
  const circ = 2 * Math.PI * r  // ≈ 314.16

  if (total === 0) {
    return (
      <svg width={140} height={140} style={{ flexShrink: 0 }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-border)" strokeWidth={strokeWidth} />
        <text x={cx} y={cy + 4} textAnchor="middle" fill="var(--color-muted-foreground)" fontSize={11}>Empty</text>
      </svg>
    )
  }

  // Each segment is drawn as a circle with stroke-dasharray clipped to its arc length,
  // then rotated to its starting angle (accumulated from previous segments)
  let accumulatedCount = 0

  return (
    <svg width={140} height={140} style={{ flexShrink: 0 }}>
      {/* Background track */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-border)" strokeWidth={strokeWidth} />

      {/* Segments — each circle is a colored arc rotated to start after the previous one */}
      {segments.map((seg, i) => {
        const arcLen = (seg.count / total) * circ
        const startAngle = (accumulatedCount / total) * 360 - 90  // -90 = start at 12 o'clock
        accumulatedCount += seg.count
        return (
          <circle
            key={i}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLen} ${circ - arcLen}`}
            transform={`rotate(${startAngle} ${cx} ${cy})`}
          />
        )
      })}

      {/* Center label */}
      <text x={cx} y={cy - 5} textAnchor="middle" fill="var(--color-foreground)" fontSize={22} fontWeight="700">{total}</text>
      <text x={cx} y={cy + 12} textAnchor="middle" fill="var(--color-muted-foreground)" fontSize={10}>processes</text>
    </svg>
  )
}

// @group BusinessLogic > HealthRow : Key-value pair row for health and summary cards
function HealthRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
      <span style={{ color: 'var(--color-muted-foreground)' }}>{label}</span>
      <span style={{ fontWeight: 600, color: valueColor ?? 'var(--color-foreground)' }}>{value}</span>
    </div>
  )
}

// @group BusinessLogic > ProcessRow : Clickable process row for leaderboard tables
function ProcessRow({ label, sub, dotColor, rank, metric, metricColor, onClick }: {
  label: string
  sub: string
  dotColor: string
  rank: number
  metric: string
  metricColor: string
  onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', borderRadius: 4, cursor: 'pointer' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-accent)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <span style={{ fontSize: 10, color: 'var(--color-muted-foreground)', minWidth: 14, textAlign: 'right' }}>{rank}</span>
      <span style={{ color: dotColor, fontSize: 9, flexShrink: 0 }}>●</span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>{label}</span>
      <span style={{ fontSize: 11, color: 'var(--color-muted-foreground)', whiteSpace: 'nowrap' }}>{sub}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: metricColor, minWidth: 50, textAlign: 'right' }}>{metric}</span>
    </div>
  )
}

// @group BusinessLogic > Th / Td : Table header and data cell helpers
function Th({ children }: { children: ReactNode }) {
  return <th style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600 }}>{children}</th>
}

function Td({ children, color }: { children: ReactNode; color?: string }) {
  return <td style={{ padding: '7px 8px', textAlign: 'right', color: color ?? 'var(--color-foreground)' }}>{children}</td>
}

// @group Constants > Styles : Shared card and header style objects
const cardStyle: CSSProperties = {
  background: 'var(--color-card)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  padding: '14px 16px',
}

const cardHeaderStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--color-muted-foreground)',
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
}
