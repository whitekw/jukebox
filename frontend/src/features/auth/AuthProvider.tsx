import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { authApi } from './api'
import { AuthContext, type AuthContextValue } from './context'
import type { AuthUser } from './types'
import { clearAllStoredRoomCredentials } from '../room/roomCredentials'

const logoutSyncKey = 'jukebox:auth:logout'

function currentReturnTo() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<AuthUser | null>(null)
  const authVersion = useRef(0)

  useEffect(() => {
    let active = true
    const version = authVersion.current
    void authApi
      .getAuthSession()
      .then((session) => {
        if (!active || authVersion.current !== version) return
        setEnabled(session.enabled)
        setUser(session.user)
      })
      .catch(() => {
        if (!active || authVersion.current !== version) return
        setEnabled(false)
        setUser(null)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    function handleLogoutInAnotherTab(event: StorageEvent) {
      if (event.key !== logoutSyncKey) return
      authVersion.current += 1
      try {
        clearAllStoredRoomCredentials()
      } catch {
        // Storage may be unavailable; the server session has still ended.
      }
      setUser(null)
    }
    window.addEventListener('storage', handleLogoutInAnotherTab)
    return () => window.removeEventListener('storage', handleLogoutInAnotherTab)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      enabled,
      loading,
      user,
      async refresh() {
        const version = ++authVersion.current
        const session = await authApi.getAuthSession()
        if (version !== authVersion.current) return
        setEnabled(session.enabled)
        setUser(session.user)
      },
      loginUrl(returnTo = currentReturnTo()) {
        return `/api/auth/discord?returnTo=${encodeURIComponent(returnTo)}`
      },
      async logout() {
        await authApi.logout()
        authVersion.current += 1
        try {
          clearAllStoredRoomCredentials()
          localStorage.setItem(logoutSyncKey, crypto.randomUUID())
        } catch {
          // The server session is already invalidated, even if storage fails.
        }
        setUser(null)
      },
    }),
    [enabled, loading, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
