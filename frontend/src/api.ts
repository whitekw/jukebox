import type { Participant, RoomState, VideoSearchResult } from './types'

type ControlCredentials =
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
  }
}

export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, message: string, code = 'API_ERROR') {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
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
    )
  }
  return body
}

export const api = {
  createRoom(maxSongsPerParticipant: number) {
    return request<{ code: string; hostToken: string; expiresAt: number }>(
      '/api/rooms',
      {
        method: 'POST',
        body: JSON.stringify({ maxSongsPerParticipant }),
      },
    )
  },

  getRoom(code: string) {
    return request<RoomState>(`/api/rooms/${encodeURIComponent(code)}`)
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

  moveSong(
    code: string,
    credentials: ControlCredentials,
    songId: string,
    direction: 'up' | 'down',
  ) {
    return request<RoomState>(
      `/api/rooms/${encodeURIComponent(code)}/songs/${encodeURIComponent(songId)}/move`,
      {
        method: 'POST',
        headers: controlHeaders(credentials),
        body: JSON.stringify({ direction }),
      },
    )
  },

  updateRoomSettings(
    code: string,
    credentials: ControlCredentials,
    settings: {
      hostVolume?: number
      maxSongsPerParticipant?: number
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

  transferManager(
    code: string,
    participantToken: string,
    targetParticipantId: string,
  ) {
    return request<RoomState>(
      `/api/rooms/${encodeURIComponent(code)}/manager/transfer`,
      {
        method: 'POST',
        headers: { 'x-participant-token': participantToken },
        body: JSON.stringify({ targetParticipantId }),
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
