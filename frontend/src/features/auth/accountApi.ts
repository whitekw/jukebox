import { request } from '../../shared/http'
import type { AuthUser } from './types'

export type YouTubePlaylist = { id: string; title: string; trackCount: number; thumbnailUrl: string | null }
export type YouTubeStatus = {
  enabled: boolean; connected: boolean; channelTitle: string | null
  links: { youtubeId: string; playlistId: string; name: string; syncedAt: number; skippedCount: number }[]
}
const headers = { 'x-bside-account-action': '1' }
export const accountApi = {
  updateProfile: (displayName: string, avatarUrl?: string | null) => request<{ user: AuthUser }>('/api/account/profile', { method: 'PATCH', headers, body: JSON.stringify({ displayName, avatarUrl }) }),
  remove: (confirmation: string) => request<void>('/api/account', { method: 'DELETE', headers, body: JSON.stringify({ confirmation }) }),
  youtubeStatus: () => request<YouTubeStatus>('/api/account/youtube'),
  playlists: (pageToken = '') => request<{ items: YouTubePlaylist[]; nextPageToken: string | null }>(`/api/account/youtube/playlists?pageToken=${encodeURIComponent(pageToken)}`),
  sync: (playlistIds: string[]) => request<YouTubeStatus>('/api/account/youtube/sync', { method: 'POST', headers, body: JSON.stringify({ playlistIds }) }),
  disconnect: () => request<YouTubeStatus>('/api/account/youtube', { method: 'DELETE', headers }),
  unlink: (id: string) => request<YouTubeStatus>(`/api/account/youtube/links/${encodeURIComponent(id)}`, { method: 'DELETE', headers }),
}
