export type PlaybackMode = 'host_only' | 'all_devices'
export type RoomRetentionMode = 'temporary' | 'permanent'

export type AuthUser = {
  id: string
  discordId: string
  username: string
  displayName: string
  avatarUrl: string | null
}

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
  retentionMode: RoomRetentionMode
  expiresAt: number | null
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
  avatarUrl: string | null
  isManager: boolean
}

export type Participant = {
  id: string
  nickname: string
  avatarUrl: string | null
  isManager: boolean
}

export type RoomSession = {
  isHost: boolean
  isOwner: boolean
  participant: Participant | null
  room: RoomState
}

export type RoomEventType =
  | 'song_added'
  | 'song_skipped'
  | 'song_removed'
  | 'queue_reordered'
  | 'playback_paused'
  | 'playback_resumed'
  | 'participant_joined'
  | 'participant_left'
  | 'manager_added'
  | 'manager_removed'

type ChatEntryBase = {
  id: string
  sequence: number
  participantId: string | null
  nickname: string | null
  actorType: 'participant' | 'host' | 'system'
  createdAt: number
}

export type ChatMessage =
  | (ChatEntryBase & {
      type: 'message'
      participantId: string
      nickname: string
      content: string
    })
  | (ChatEntryBase & {
      type: 'system'
      eventType: RoomEventType
      data: Record<string, string | number | boolean>
    })

export type VideoSearchResult = {
  videoId: string
  title: string
  artist: string
  durationSeconds: number
  thumbnailUrl: string
  embeddable: boolean
}
