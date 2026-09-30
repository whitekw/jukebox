import { useCallback, useEffect, useRef, useState } from 'react'
import { libraryApi, type Playlist } from './api'

type LibrarySession = {
  userId: string
  active: boolean
  requestSequence: number
  saving: boolean
  reloadPending: boolean
}

export function usePlaylistOrder(userId: string | undefined, revision: number) {
  const [loaded, setLoaded] = useState<{ userId: string; items: Playlist[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [reorderError, setReorderError] = useState<unknown>(null)
  const sessionRef = useRef<LibrarySession | null>(null)
  const revisionRef = useRef(revision)

  const reload = useCallback(() => {
    const session = sessionRef.current
    if (!session?.active) return
    if (session.saving) {
      session.reloadPending = true
      return
    }
    const requestId = ++session.requestSequence
    setLoading(true)
    void libraryApi.list().then(({ items }) => {
      if (!session.active || requestId !== session.requestSequence) return
      setLoaded({ userId: session.userId, items })
      setError(false)
      setReorderError(null)
    }).catch(() => {
      if (session.active && requestId === session.requestSequence) setError(true)
    }).finally(() => {
      if (session.active && requestId === session.requestSequence) setLoading(false)
    })
  }, [])

  useEffect(() => {
    setLoading(false)
    setSaving(false)
    setError(false)
    setReorderError(null)
    if (!userId) return
    const session: LibrarySession = { userId, active: true, requestSequence: 0, saving: false, reloadPending: false }
    sessionRef.current = session
    reload()
    window.addEventListener('focus', reload)
    return () => {
      session.active = false
      sessionRef.current = null
      window.removeEventListener('focus', reload)
    }
  }, [userId, reload])

  useEffect(() => {
    if (revisionRef.current === revision) return
    revisionRef.current = revision
    reload()
  }, [revision, reload])

  async function reorder(playlistId: string, targetIndex: number) {
    const session = sessionRef.current
    if (!session?.active || session.saving) return
    session.saving = true
    session.requestSequence += 1
    setLoading(false)
    setSaving(true)
    setReorderError(null)
    try {
      const { items } = await libraryApi.reorder(playlistId, targetIndex)
      if (!session.active) return
      setLoaded({ userId: session.userId, items })
      setError(false)
    } catch (requestError) {
      if (session.active) setReorderError(requestError)
    } finally {
      session.saving = false
      if (session.active) {
        setSaving(false)
        if (session.reloadPending) {
          session.reloadPending = false
          reload()
        }
      }
    }
  }

  return {
    playlists: loaded?.userId === userId ? loaded?.items ?? [] : [],
    loading, error, saving, reorderError, reload, reorder,
  }
}
