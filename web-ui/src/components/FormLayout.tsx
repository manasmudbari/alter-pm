// @group Utilities : Shared form layout primitives

import type { ReactNode } from 'react'

export function FormCard({ children, onSubmit }: { children: ReactNode; onSubmit: (e: React.FormEvent) => void }) {
  return (
    <form onSubmit={onSubmit} style={{
      background: 'var(--color-card)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      padding: '20px 24px',
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      maxWidth: 860,
    }}>
      {children}
    </form>
  )
}

export function FormRow({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      {children}
    </div>
  )
}

export function FormField({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-muted-foreground)' }}>
        {label}
      </label>
      {children}
    </div>
  )
}
