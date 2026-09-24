import { request } from '../../shared/http'
import type { AuthUser } from './types'

export const authApi = {
  getAuthSession() {
    return request<{ enabled: boolean; user: AuthUser | null }>(
      '/api/auth/session',
    )
  },
  logout() {
    return request<void>('/api/auth/logout', { method: 'POST' })
  },
}
