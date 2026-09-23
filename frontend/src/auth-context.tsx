import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { api } from './api'
import { AuthContext, type AuthContextValue } from './auth'
import type { AuthUser } from './types'

function currentReturnTo() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<AuthUser | null>(null)

  useEffect(() => {
    let active = true
    void api
      .getAuthSession()
      .then((session) => {
        if (!active) return
        setEnabled(session.enabled)
        setUser(session.user)
      })
      .catch(() => {
        if (!active) return
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

  const value = useMemo<AuthContextValue>(
    () => ({
      enabled,
      loading,
      user,
      loginUrl(returnTo = currentReturnTo()) {
        return `/api/auth/discord?returnTo=${encodeURIComponent(returnTo)}`
      },
      async logout() {
        await api.logout()
        setUser(null)
      },
    }),
    [enabled, loading, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
