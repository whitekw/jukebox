export type PlaybackMode = 'host_only' | 'all_devices'

export type Song = {
  id: string
  videoId: string
  title: string
  artist: string
  durationSeconds: number
  thumbnailUrl: string
  addedBy: string
  addedById: string
  position: number
}

export type RoomState = {
  code: string
  expiresAt: number
  managerParticipantId: string | null
  hostVolume: number
  playbackMode: PlaybackMode
  playbackPaused: boolean
  playbackBlocked: boolean
  playbackPositionSeconds: number
  playbackAnchorAt: number
  playbackPending: boolean
  playbackRevision: number
  serverTime: number
  participants: RoomParticipant[]
  currentSong: Song | null
  queue: Song[]
}

export type RoomParticipant = {
  id: string
  nickname: string
  isManager: boolean
}

export type Participant = {
  id: string
  nickname: string
  isManager?: boolean
}

export type RoomSession = {
  isHost: boolean
  participant: Participant | null
  room: RoomState
}

export type VideoSearchResult = {
  videoId: string
  title: string
  artist: string
  durationSeconds: number
  thumbnailUrl: string
  embeddable: boolean
}
