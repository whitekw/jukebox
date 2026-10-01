import { useCallback, useEffect, useState } from 'react'

export function useAdminData<T>(load: (signal: AbortSignal) => Promise<T>, refreshMs = 0) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  const reload = useCallback(() => setRevision((value) => value + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    load(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return
        setData(result)
        setError(null)
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '불러오지 못했습니다.')
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [load, revision])

  useEffect(() => {
    if (!refreshMs) return
    const timer = window.setInterval(reload, refreshMs)
    return () => window.clearInterval(timer)
  }, [refreshMs, reload])

  return { data, error, loading, reload }
}
