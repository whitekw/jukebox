import { request } from '../../shared/http'
import type { AdminUser, AuditEntry, Overview, Page, RoomDetail, RoomSummary, RoomUserRecordsPreview, UserSummary } from './types'

const base = '/api/admin'

function localDayStarts() {
  const today = new Date()
  return Array.from({ length: 15 }, (_, index) =>
    new Date(today.getFullYear(), today.getMonth(), today.getDate() - 13 + index).getTime())
}

export const adminApi = {
  session: (signal?: AbortSignal) => request<{ user: AdminUser }>(`${base}/session`, { signal }),
  overview: (signal?: AbortSignal) =>
    request<Overview>(`${base}/overview?dayStarts=${localDayStarts().join(',')}`, { signal }),
  rooms: (query: string, page: number, signal?: AbortSignal) =>
    request<Page<RoomSummary>>(`${base}/rooms?query=${encodeURIComponent(query)}&page=${page}`, { signal }),
  room: (code: string, signal?: AbortSignal) =>
    request<RoomDetail>(`${base}/rooms/${encodeURIComponent(code)}`, { signal }),
  roomParticipants: (code: string, query: string, page: number, signal?: AbortSignal) =>
    request<Page<RoomDetail['participants'][number]>>(
      `${base}/rooms/${encodeURIComponent(code)}/participants?query=${encodeURIComponent(query)}&page=${page}`, { signal },
    ),
  roomUserRecords: (code: string, participantId: string, signal?: AbortSignal) =>
    request<RoomUserRecordsPreview>(`${base}/rooms/${encodeURIComponent(code)}/participants/${encodeURIComponent(participantId)}/records`, { signal }),
  deleteRoomUserRecords: (code: string, participantId: string, confirmationCode: string, revision: string) =>
    request<Pick<RoomUserRecordsPreview, 'code' | 'target' | 'counts'>>(
      `${base}/rooms/${encodeURIComponent(code)}/participants/${encodeURIComponent(participantId)}/records`, {
        method: 'DELETE', body: JSON.stringify({ confirmationCode, revision }),
      },
    ),
  users: (query: string, page: number, signal?: AbortSignal) =>
    request<Page<UserSummary>>(`${base}/users?query=${encodeURIComponent(query)}&page=${page}`, { signal }),
  audit: (signal?: AbortSignal) => request<{ items: AuditEntry[] }>(`${base}/audit`, { signal }),
  setRoomPaused: (code: string, paused: boolean) =>
    request(`${base}/rooms/${encodeURIComponent(code)}/playback`, {
      method: 'PATCH', body: JSON.stringify({ paused }),
    }),
  revokeSessions: (userId: string) =>
    request<{ revoked: number }>(`${base}/users/${encodeURIComponent(userId)}/revoke-sessions`, {
      method: 'POST',
    }),
}
