// @group BusinessLogic : Fetch daemon health info

import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { DaemonHealth } from '@/types'

export function useDaemonHealth() {
  const [health, setHealth] = useState<DaemonHealth | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await api.getHealth()
      setHealth(data)
    } catch {
      setHealth(null)
    }
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, 5000)
    return () => clearInterval(timer)
  }, [load])

  return health
}
