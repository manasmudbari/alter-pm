// @group BusinessLogic : Root app — layout shell + React Router

import { useState } from 'react'
import { BrowserRouter, Link, Route, Routes, useNavigate } from 'react-router-dom'
import { useDaemonHealth } from '@/hooks/useDaemonHealth'
import { useProcesses } from '@/hooks/useProcesses'
import { formatUptime, statusColor } from '@/lib/utils'
import { api } from '@/lib/api'
import ProcessesPage from '@/pages/ProcessesPage'
import CronJobsPage from '@/pages/CronJobsPage'
import CreateCronJobPage from '@/pages/CreateCronJobPage'
import StartPage from '@/pages/StartPage'
import EditPage from '@/pages/EditPage'
import ProcessDetailPage from '@/pages/ProcessDetailPage'
import type { ProcessInfo } from '@/types'

// @group BusinessLogic > Layout : Sidebar + content shell
function Layout() {
  const [autoRefresh, setAutoRefresh] = useState(true)
  const { processes, error, reload } = useProcesses(autoRefresh)
  const health = useDaemonHealth()
  const navigate = useNavigate()

  const active = processes.filter(p => p.status === 'running' || p.status === 'sleeping' || p.status === 'watching')
  const connected = error === null

  async function handleSave() {
    await api.saveState().catch(() => {})
    alert('State saved.')
  }

  async function handleShutdown() {
    if (!confirm('Shutdown the alter daemon? Managed processes keep running.')) return
    await api.shutdownDaemon().catch(() => {})
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      <aside style={{
        width: 220,
        minWidth: 220,
        background: 'var(--color-card)',
        borderRight: '1px solid var(--color-border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
      }}>
        {/* Logo */}
        <div style={{
          padding: '14px 16px',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
            <span style={{ fontWeight: 700, fontSize: 18, letterSpacing: '-0.5px', color: 'var(--color-primary)' }}>alter</span>
            <span style={{ fontSize: 11, color: 'var(--color-muted-foreground)', fontWeight: 500 }}>pm</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            <span style={{
              fontSize: 11, fontWeight: 600,
              color: connected ? 'var(--color-status-running)' : 'var(--color-status-crashed)',
            }}>
              ● {connected ? 'connected' : 'disconnected'}
            </span>
            {health && (
              <span style={{ fontSize: 10, color: 'var(--color-muted-foreground)' }}>
                v{health.version} · {formatUptime(health.uptime_secs)}
              </span>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav style={{ padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
          <NavBtn to="/" label="▦  Processes" />
          <NavBtn to="/start" label="+  Start Process" />
          <div style={{ height: 4 }} />
          <NavBtn to="/cron-jobs" label="⏱  Cron Jobs" />
          <NavBtn to="/cron-jobs/new" label="+  New Cron Job" />
        </nav>

        {/* Running processes */}
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-muted-foreground)', padding: '4px 16px 6px', letterSpacing: '0.08em' }}>
            ACTIVE
          </div>
          {active.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--color-muted-foreground)', padding: '4px 16px' }}>No active processes</div>
            : active.map(p => <SidebarProc key={p.id} p={p} onNavigate={() => navigate(`/processes/${p.id}`)} />)
          }
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-muted-foreground)', cursor: 'pointer' }}>
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} style={{ accentColor: 'var(--color-primary)' }} />
            Auto-refresh
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            <SidebarBtn label="Save" onClick={handleSave} />
            <SidebarBtn label="Shutdown" onClick={handleShutdown} danger />
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        <Routes>
          <Route path="/" element={<ProcessesPage processes={processes} reload={reload} />} />
          <Route path="/start" element={<StartPage onDone={() => { reload(); navigate('/') }} />} />
          <Route path="/edit/:id" element={<EditPage onDone={() => { reload(); navigate('/') }} />} />
          <Route path="/processes/:id" element={<ProcessDetailPage reload={reload} />} />
          <Route path="/cron-jobs" element={<CronJobsPage processes={processes} reload={reload} />} />
          <Route path="/cron-jobs/new" element={<CreateCronJobPage onDone={() => { reload(); navigate('/cron-jobs') }} />} />
        </Routes>
      </div>
    </div>
  )
}

function NavBtn({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} style={{
      display: 'block',
      padding: '7px 16px',
      fontSize: 13,
      color: 'var(--color-foreground)',
      textDecoration: 'none',
      fontWeight: 500,
    }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-accent)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {label}
    </Link>
  )
}

function SidebarProc({ p, onNavigate }: { p: ProcessInfo; onNavigate: () => void }) {
  return (
    <button onClick={onNavigate} style={{
      display: 'flex', alignItems: 'center', gap: 8,
      width: '100%', padding: '5px 16px', background: 'transparent',
      border: 'none', cursor: 'pointer', color: 'var(--color-foreground)',
      fontSize: 12, textAlign: 'left',
    }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-accent)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <span style={{ color: statusColor(p.status), fontSize: 10 }}>●</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
    </button>
  )
}

function SidebarBtn({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: '5px 8px', fontSize: 11, fontWeight: 500,
      background: 'var(--color-secondary)', border: '1px solid var(--color-border)',
      borderRadius: 5, cursor: 'pointer',
      color: danger ? 'var(--color-destructive)' : 'var(--color-foreground)',
    }}>
      {label}
    </button>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  )
}
