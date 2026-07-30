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
  maxSongsPerParticipant: number
  managerParticipantId: string | null
  hostVolume: number
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
  songsLeft?: number
}

export type VideoSearchResult = {
  videoId: string
  title: string
  artist: string
  durationSeconds: number
  thumbnailUrl: string
}
