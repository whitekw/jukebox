import { request } from '../../shared/http'

export type Playlist = {
  id: string
  name: string
  kind: 'favorites' | 'custom'
  updatedAt: number
  trackCount: number
  containsTrack: boolean
  thumbnailUrl: string | null
}

export const libraryApi = {
  list(videoId: string) {
    return request<{ items: Playlist[] }>(`/api/me/playlists?videoId=${encodeURIComponent(videoId)}`)
  },
  create(name: string) {
    return request<Playlist>('/api/me/playlists', {
      method: 'POST',
      body: JSON.stringify({ name }),
    })
  },
  addTrack(playlistId: string, roomSongId: string) {
    return request<{ videoId: string; added: boolean }>(`/api/me/playlists/${encodeURIComponent(playlistId)}/tracks`, {
      method: 'PUT',
      body: JSON.stringify({ roomSongId }),
    })
  },
  removeTrack(playlistId: string, videoId: string) {
    return request<{ videoId: string; added: boolean }>(`/api/me/playlists/${encodeURIComponent(playlistId)}/tracks/${encodeURIComponent(videoId)}`, {
      method: 'DELETE',
    })
  },
}
