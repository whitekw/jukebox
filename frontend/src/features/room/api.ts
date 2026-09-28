import type {
  ChatMessage,
  Participant,
  PlaybackMode,
  RoomSession,
  RoomState,
  VideoSearchResult,
} from './types'
import { request } from '../../shared/http'

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

export const roomApi = {
  createRoom(
    playbackMode: PlaybackMode,
    title: string,
    allowGuests: boolean,
  ) {
    return request<{
      code: string
      hostToken?: string
      playbackMode: PlaybackMode
      participantToken: string
      participant: Participant
    }>(
      '/api/rooms',
      {
        method: 'POST',
        body: JSON.stringify({
          playbackMode,
          title,
          allowGuests,
        }),
      },
    )
  },

  getOwnedRooms() {
    return request<{ items: RoomState[] }>('/api/rooms/owned')
  },

  getJoinedRooms() {
    return request<{ items: RoomState[] }>('/api/rooms/joined')
  },

  leaveRoom(code: string) {
    return request<void>(`/api/rooms/${encodeURIComponent(code)}/membership`, {
      method: 'DELETE',
    })
  },

  deleteRoom(code: string) {
    return request<void>(`/api/rooms/${encodeURIComponent(code)}`, {
      method: 'DELETE',
    })
  },

  claimRoomHost(code: string) {
    return request<{
      hostToken: string
      room: RoomState
    }>(`/api/rooms/${encodeURIComponent(code)}/host`, {
      method: 'POST',
      body: '{}',
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

  joinRoom(code: string, nickname: string, participantToken?: string) {
    return request<{
      participantToken: string
      participant: Participant
      room: RoomState
    }>(`/api/rooms/${encodeURIComponent(code)}/join`, {
      method: 'POST',
      headers: participantToken ? { 'x-participant-token': participantToken } : {},
      body: JSON.stringify({ nickname }),
    })
  },

  resumeRoom(code: string) {
    return request<{
      participantToken: string
      participant: Participant
      room: RoomState
    }>(`/api/rooms/${encodeURIComponent(code)}/resume`, { method: 'POST' })
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
      title?: string
      allowGuests?: boolean
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

  disconnectParticipant(code: string, targetParticipantId: string) {
    return request<RoomState>(
      `/api/rooms/${encodeURIComponent(code)}/participants/${encodeURIComponent(targetParticipantId)}/disconnect`,
      { method: 'POST', body: '{}' },
    )
  },

}
