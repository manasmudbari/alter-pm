// @group BusinessLogic : Global keyboard shortcut registration hook

import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

// @group Types : Handlers passed in from the Layout
export interface ShortcutHandlers {
  onReload?: () => void
  onShowHelp?: () => void
}

// @group BusinessLogic : Register global keyboard shortcuts
// Shortcuts fire only when focus is NOT in an input/textarea/select.
// 'g' acts as a chord prefix: press g then a second key to navigate.
export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  const navigate = useNavigate()
  // Track g-chord state without causing re-renders
  const gChordRef = useRef(false)
  const gTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function clearGChord() {
      gChordRef.current = false
      if (gTimerRef.current) {
        clearTimeout(gTimerRef.current)
        gTimerRef.current = null
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      // Skip modifier combos
      if (e.ctrlKey || e.metaKey || e.altKey) return

      // Skip when typing in form elements
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      const key = e.key.toLowerCase()

      // @group BusinessLogic > GChord : Handle g-chord navigation
      if (gChordRef.current) {
        clearGChord()
        e.preventDefault()
        switch (key) {
          case 'p': navigate('/processes'); break
          case 'h': navigate('/');          break
          case 's': navigate('/settings');  break
          case 'n': navigate('/start');     break
          case 'c': navigate('/cron-jobs'); break
        }
        return
      }

      // @group BusinessLogic > SingleKey : Single-key shortcuts
      switch (key) {
        case 'r':
          e.preventDefault()
          handlers.onReload?.()
          break
        case 'n':
          e.preventDefault()
          navigate('/start')
          break
        case '?':
          e.preventDefault()
          handlers.onShowHelp?.()
          break
        case 'g':
          // Start chord — wait 1 second for next key
          gChordRef.current = true
          gTimerRef.current = setTimeout(clearGChord, 1000)
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      clearGChord()
    }
  }, [navigate, handlers])
}
