// @group BusinessLogic : AI assistant panel — slide-in chat powered by GitHub Models API

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Bot, Send, Trash2, Loader } from 'lucide-react'
import { api } from '@/lib/api'
import type { AiChatMessage } from '@/lib/api'

// @group BusinessLogic > AiPanel : Props
interface AiPanelProps {
  open: boolean
  processId?: string | null
  processName?: string | null
  onClose: () => void
}

// @group Utilities > Styles : Panel style tokens
const panelWidth = 360

const iconBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 28, height: 28,
  background: 'transparent', border: 'none', cursor: 'pointer',
  color: 'var(--color-muted-foreground)', borderRadius: 5,
}

// @group BusinessLogic > AiPanel : Main chat panel component
export function AiPanel({ open, processId, processName, onClose }: AiPanelProps) {
  const [messages, setMessages] = useState<AiChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input when panel opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  function clearChat() {
    if (streaming) { abortRef.current?.abort(); setStreaming(false) }
    setMessages([])
    setError(null)
  }

  async function sendMessage() {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    setError(null)

    const userMsg: AiChatMessage = { role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])

    // Placeholder for the assistant reply that we stream into
    const assistantMsg: AiChatMessage = { role: 'assistant', content: '' }
    setMessages(prev => [...prev, assistantMsg])
    setStreaming(true)

    // Build history from all but the last empty placeholder we just added
    const history = messages.concat(userMsg)

    const abort = api.aiChat(
      { message: text, process_id: processId ?? undefined, history },
      (delta) => {
        setMessages(prev => {
          const copy = [...prev]
          const last = copy[copy.length - 1]
          if (last?.role === 'assistant') {
            copy[copy.length - 1] = { ...last, content: last.content + delta }
          }
          return copy
        })
      },
      () => { setStreaming(false) },
      (err) => { setError(err); setStreaming(false) },
    )
    abortRef.current = abort
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const panel = (
    <>
      {/* Backdrop */}
      {open && (
        <div
          onClick={onClose}
          style={{ position: 'fixed', inset: 0, zIndex: 199 }}
        />
      )}

      {/* Panel — slides in from right */}
      <div style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: panelWidth,
        height: '100vh',
        zIndex: 200,
        background: 'var(--color-card)',
        borderLeft: '1px solid var(--color-border)',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.35)',
        transform: open ? 'translateX(0)' : `translateX(${panelWidth + 4}px)`,
        transition: 'transform 0.22s cubic-bezier(0.4,0,0.2,1)',
      }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '12px 14px',
          borderBottom: '1px solid var(--color-border)',
          flexShrink: 0,
        }}>
          <Bot size={15} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-foreground)' }}>
              AI Assistant
            </div>
            {processName && (
              <div style={{ fontSize: 10, color: 'var(--color-muted-foreground)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Context: {processName}
              </div>
            )}
            {!processName && (
              <div style={{ fontSize: 10, color: 'var(--color-muted-foreground)', marginTop: 1 }}>
                GitHub Copilot · GitHub Models
              </div>
            )}
          </div>
          <button
            title="Clear chat"
            onClick={clearChat}
            style={{ ...iconBtn }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-foreground)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-muted-foreground)' }}
          >
            <Trash2 size={13} />
          </button>
          <button
            title="Close"
            onClick={onClose}
            style={{ ...iconBtn }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-foreground)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-muted-foreground)' }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {messages.length === 0 && !error && (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              color: 'var(--color-muted-foreground)', gap: 8, paddingBottom: 40,
            }}>
              <Bot size={28} style={{ opacity: 0.35 }} />
              <div style={{ fontSize: 12, textAlign: 'center', lineHeight: 1.5 }}>
                Ask about your processes,<br />logs, crashes, or config.
              </div>
              {processName && (
                <div style={{
                  fontSize: 11, marginTop: 4, padding: '4px 10px',
                  background: 'var(--color-accent)', borderRadius: 12,
                  color: 'var(--color-primary)', fontWeight: 500,
                }}>
                  Process context: {processName}
                </div>
              )}
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              <div style={{
                maxWidth: '85%',
                padding: '8px 11px',
                borderRadius: msg.role === 'user' ? '12px 12px 3px 12px' : '12px 12px 12px 3px',
                background: msg.role === 'user' ? 'var(--color-primary)' : 'var(--color-secondary)',
                color: msg.role === 'user' ? '#fff' : 'var(--color-foreground)',
                fontSize: 12,
                lineHeight: 1.55,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {msg.content}
                {msg.role === 'assistant' && msg.content === '' && streaming && (
                  <span style={{ opacity: 0.5 }}>●</span>
                )}
              </div>
            </div>
          ))}

          {error && (
            <div style={{
              fontSize: 11, color: 'var(--color-destructive)',
              padding: '8px 10px',
              background: 'color-mix(in srgb, var(--color-destructive) 10%, transparent)',
              borderRadius: 6, border: '1px solid color-mix(in srgb, var(--color-destructive) 30%, transparent)',
            }}>
              {error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div style={{
          padding: '10px 12px',
          borderTop: '1px solid var(--color-border)',
          flexShrink: 0,
          display: 'flex',
          gap: 8,
          alignItems: 'flex-end',
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything… (Enter to send)"
            rows={1}
            disabled={streaming}
            style={{
              flex: 1,
              resize: 'none',
              padding: '7px 10px',
              fontSize: 12,
              borderRadius: 6,
              border: '1px solid var(--color-border)',
              background: 'var(--color-background)',
              color: 'var(--color-foreground)',
              fontFamily: 'inherit',
              outline: 'none',
              lineHeight: 1.5,
              maxHeight: 100,
              overflowY: 'auto',
              opacity: streaming ? 0.6 : 1,
            }}
            onInput={e => {
              const el = e.currentTarget
              el.style.height = 'auto'
              el.style.height = Math.min(el.scrollHeight, 100) + 'px'
            }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || streaming}
            title="Send (Enter)"
            style={{
              width: 32, height: 32, flexShrink: 0,
              borderRadius: 6, border: 'none', cursor: 'pointer',
              background: (!input.trim() || streaming) ? 'var(--color-secondary)' : 'var(--color-primary)',
              color: (!input.trim() || streaming) ? 'var(--color-muted-foreground)' : '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.15s',
            }}
          >
            {streaming ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={13} />}
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </>
  )

  return createPortal(panel, document.body)
}
