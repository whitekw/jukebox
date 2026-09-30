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

export type LibraryTrack = {
  videoId: string
  title: string
  artist: string
  durationSeconds: number
  thumbnailUrl: string
  addedAt: number
}

export const libraryApi = {
  list(videoId?: string) {
    return request<{ items: Playlist[] }>(`/api/me/playlists${videoId ? `?videoId=${encodeURIComponent(videoId)}` : ''}`)
  },
  savedVideoIds() {
    return request<{ videoIds: string[] }>('/api/me/saved-videos')
  },
  getTracks(playlistId: string) {
    return request<{ items: LibraryTrack[] }>(`/api/me/playlists/${encodeURIComponent(playlistId)}/tracks`)
  },
  create(name: string) {
    return request<Playlist>('/api/me/playlists', {
      method: 'POST',
      body: JSON.stringify({ name }),
    })
  },
  reorder(playlistId: string, targetIndex: number) {
    return request<{ items: Playlist[] }>(`/api/me/playlists/${encodeURIComponent(playlistId)}/reorder`, {
      method: 'POST',
      body: JSON.stringify({ targetIndex }),
    })
  },
  rename(playlistId: string, name: string) {
    return request<{ id: string; name: string; updatedAt: number }>(`/api/me/playlists/${encodeURIComponent(playlistId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    })
  },
  remove(playlistId: string) {
    return request<{ deleted: boolean }>(`/api/me/playlists/${encodeURIComponent(playlistId)}`, {
      method: 'DELETE',
    })
  },
  addTrack(playlistId: string, roomSongId: string) {
    return request<{ videoId: string; added: boolean }>(`/api/me/playlists/${encodeURIComponent(playlistId)}/tracks`, {
      method: 'PUT',
      body: JSON.stringify({ roomSongId }),
    })
  },
  addExistingTrack(playlistId: string, videoId: string) {
    return request<{ videoId: string; added: boolean }>(`/api/me/playlists/${encodeURIComponent(playlistId)}/tracks`, {
      method: 'PUT',
      body: JSON.stringify({ videoId }),
    })
  },
  removeTrack(playlistId: string, videoId: string) {
    return request<{ videoId: string; added: boolean }>(`/api/me/playlists/${encodeURIComponent(playlistId)}/tracks/${encodeURIComponent(videoId)}`, {
      method: 'DELETE',
    })
  },
}
