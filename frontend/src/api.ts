import type {
  AuthUser,
  ChatMessage,
  Participant,
  PlaybackMode,
  RoomRetentionMode,
  RoomSession,
  RoomState,
  VideoSearchResult,
} from './types'

export type ControlCredentials =
  | string
  | {
      hostToken?: string
      participantToken?: string
    }

function controlHeaders(credentials: ControlCredentials) {
  if (typeof credentials === 'string') {
    return { 'x-host-token': credentials }
  }
  return {
    ...(credentials.hostToken
      ? { 'x-host-token': credentials.hostToken }
      : {}),
    ...(credentials.participantToken
      ? { 'x-participant-token': credentials.participantToken }
      : {}),
  }
}

type ApiErrorBody = {
  error?: {
    code?: string
    message?: string
    details?: Record<string, string | number>
  }
}

export class ApiError extends Error {
  status: number
  code: string
  details?: Record<string, string | number>

  constructor(
    status: number,
    message: string,
    code = 'API_ERROR',
    details?: Record<string, string | number>,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  const body = (await response.json().catch(() => ({}))) as T & ApiErrorBody
  if (!response.ok) {
    throw new ApiError(
      response.status,
      body.error?.message ?? '요청을 처리하지 못했습니다.',
      body.error?.code,
      body.error?.details,
    )
  }
  return body
}

export const api = {
  getAuthSession() {
    return request<{
      enabled: boolean
      user: AuthUser | null
    }>('/api/auth/session')
  },

  logout() {
    return request<void>('/api/auth/logout', { method: 'POST' })
  },

  getConfig() {
    return request<{
      countryCode: string | null
      suggestedLocale: 'ko' | 'ja' | 'en'
    }>('/api/config')
  },

  createRoom(
    playbackMode: PlaybackMode,
  ) {
    return request<{
      code: string
      hostToken: string
      playbackMode: PlaybackMode
      retentionMode: RoomRetentionMode
      expiresAt: number | null
      participantToken: string
      participant: Participant
    }>(
      '/api/rooms',
      {
        method: 'POST',
        body: JSON.stringify({
          playbackMode,
        }),
      },
    )
  },

  getOwnedRooms() {
    return request<{ items: RoomState[] }>('/api/rooms/owned')
  },

  deleteRoom(code: string) {
    return request<void>(`/api/rooms/${encodeURIComponent(code)}`, {
      method: 'DELETE',
    })
  },

  getRoom(code: string) {
    return request<RoomState>(`/api/rooms/${encodeURIComponent(code)}`)
  },

  getRoomSession(code: string, credentials: ControlCredentials) {
    return request<RoomSession>(
      `/api/rooms/${encodeURIComponent(code)}/session`,
      { headers: controlHeaders(credentials) },
    )
  },

  joinRoom(code: string, nickname: string) {
    return request<{
      participantToken: string
      participant: Participant
      room: RoomState
    }>(`/api/rooms/${encodeURIComponent(code)}/join`, {
      method: 'POST',
      body: JSON.stringify({ nickname }),
    })
  },

  getMe(code: string, participantToken: string) {
    return request<Participant>(`/api/rooms/${encodeURIComponent(code)}/me`, {
      headers: { 'x-participant-token': participantToken },
    })
  },

  getChatMessages(code: string, participantToken: string) {
    return request<{ items: ChatMessage[] }>(
      `/api/rooms/${encodeURIComponent(code)}/messages`,
      { headers: { 'x-participant-token': participantToken } },
    )
  },

  sendChatMessage(
    code: string,
    participantToken: string,
    content: string,
  ) {
    return request<ChatMessage>(
      `/api/rooms/${encodeURIComponent(code)}/messages`,
      {
        method: 'POST',
        headers: { 'x-participant-token': participantToken },
        body: JSON.stringify({ content }),
      },
    )
  },

  searchVideos(query: string) {
    return request<{ items: VideoSearchResult[] }>(
      `/api/youtube/search?q=${encodeURIComponent(query)}`,
    )
  },

  addSong(code: string, participantToken: string, videoId: string) {
    return request<RoomState>(`/api/rooms/${encodeURIComponent(code)}/songs`, {
      method: 'POST',
      headers: { 'x-participant-token': participantToken },
      body: JSON.stringify({ videoId }),
    })
  },

  advance(code: string, credentials: ControlCredentials) {
    return request<RoomState>(`/api/rooms/${encodeURIComponent(code)}/advance`, {
      method: 'POST',
      headers: controlHeaders(credentials),
      body: '{}',
    })
  },

  setPlaybackPaused(
    code: string,
    credentials: ControlCredentials,
    paused: boolean,
  ) {
    return request<RoomState>(
      `/api/rooms/${encodeURIComponent(code)}/playback`,
      {
        method: 'PATCH',
        headers: controlHeaders(credentials),
        body: JSON.stringify({ paused }),
      },
    )
  },

  startPlayback(
    code: string,
    credentials: ControlCredentials,
    videoId: string,
    positionSeconds: number,
  ) {
    return request<RoomState>(
      `/api/rooms/${encodeURIComponent(code)}/playback/start`,
      {
        method: 'POST',
        headers: controlHeaders(credentials),
        body: JSON.stringify({ videoId, positionSeconds }),
      },
    )
  },

  reportPlaybackBlocked(code: string, hostToken: string, blocked: boolean) {
    return request<RoomState>(
      `/api/rooms/${encodeURIComponent(code)}/playback/autoplay-blocked`,
      {
        method: 'PATCH',
        headers: { 'x-host-token': hostToken },
        body: JSON.stringify({ blocked }),
      },
    )
  },

  removeSong(code: string, credentials: ControlCredentials, songId: string) {
    return request<RoomState>(
      `/api/rooms/${encodeURIComponent(code)}/songs/${encodeURIComponent(songId)}`,
      {
        method: 'DELETE',
        headers: controlHeaders(credentials),
      },
    )
  },

  reorderSong(
    code: string,
    credentials: ControlCredentials,
    songId: string,
    targetIndex: number,
  ) {
    return request<RoomState>(
      `/api/rooms/${encodeURIComponent(code)}/songs/${encodeURIComponent(songId)}/reorder`,
      {
        method: 'POST',
        headers: controlHeaders(credentials),
        body: JSON.stringify({ targetIndex }),
      },
    )
  },

  updateRoomSettings(
    code: string,
    credentials: ControlCredentials,
    settings: {
      hostVolume?: number
    },
  ) {
    return request<RoomState>(
      `/api/rooms/${encodeURIComponent(code)}/settings`,
      {
        method: 'PATCH',
        headers: controlHeaders(credentials),
        body: JSON.stringify(settings),
      },
    )
  },

  setManager(
    code: string,
    credentials: ControlCredentials,
    targetParticipantId: string,
    isManager: boolean,
  ) {
    return request<RoomState>(
      `/api/rooms/${encodeURIComponent(code)}/managers/${encodeURIComponent(targetParticipantId)}`,
      {
        method: 'PATCH',
        headers: controlHeaders(credentials),
        body: JSON.stringify({ isManager }),
      },
    )
  },
}

export function normalizeRoomCode(code: string | undefined) {
  return String(code ?? '').trim().toUpperCase()
}

export function hostTokenKey(code: string) {
  return `jukebox:host:${normalizeRoomCode(code)}`
}

export function participantTokenKey(code: string) {
  return `jukebox:participant:${normalizeRoomCode(code)}`
}

export type StoredRoomCredentials = {
  code: string
  hostToken?: string
  participantToken?: string
}

export function getStoredRoomCredentials(): StoredRoomCredentials[] {
  const credentialsByCode = new Map<string, StoredRoomCredentials>()
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (!key) continue
    const [prefix, credentialType, rawCode] = key.split(':')
    if (
      prefix !== 'jukebox' ||
      !['host', 'participant'].includes(credentialType) ||
      !rawCode
    ) {
      continue
    }
    const code = normalizeRoomCode(rawCode)
    if (!/^[A-Z0-9]{6}$/.test(code)) continue
    const token = localStorage.getItem(key)
    if (!token) continue
    const credentials = credentialsByCode.get(code) ?? { code }
    if (credentialType === 'host') credentials.hostToken = token
    if (credentialType === 'participant') credentials.participantToken = token
    credentialsByCode.set(code, credentials)
  }
  return [...credentialsByCode.values()]
}

export function clearStoredRoomCredentials(code: string) {
  localStorage.removeItem(hostTokenKey(code))
  localStorage.removeItem(participantTokenKey(code))
}
