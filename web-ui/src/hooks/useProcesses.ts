// @group BusinessLogic : Poll /api/v1/processes every 3s

import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import type { ProcessInfo } from '@/types'

export function useProcesses(autoRefresh = true) {
  const [processes, setProcesses] = useState<ProcessInfo[]>([])
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await api.getProcesses()
      setProcesses(data.processes ?? [])
      setError(null)
    } catch {
      setError('disconnected')
    }
  }, [])

  useEffect(() => {
    load()
    if (autoRefresh) {
      timerRef.current = setInterval(load, 3000)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [load, autoRefresh])

  return { processes, error, reload: load }
}
