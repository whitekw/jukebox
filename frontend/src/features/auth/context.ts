import { createContext, useContext } from 'react'
import type { AuthUser } from './types'

export type AuthContextValue = {
  enabled: boolean
  loading: boolean
  user: AuthUser | null
  loginUrl: (returnTo?: string) => string
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
