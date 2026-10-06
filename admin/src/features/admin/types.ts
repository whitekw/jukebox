export type AdminUser = {
  id: string
  discordId: string
  username: string
  displayName: string
  avatarUrl: string | null
}

export type Overview = {
  totals: {
    users: number
    rooms: number
    activeRooms: number
    onlineParticipants: number
    queuedSongs: number
    playsToday: number
    totalPlays: number
  }
  daily: { startAt: number; plays: number; rooms: number }[]
  generatedAt: number
  service: {
    uptimeSeconds: number
    discordLoginEnabled: boolean
    youtubeApiConfigured: boolean
  }
}

export type Page<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export type RoomSummary = {
  code: string
  title: string
  createdAt: number
  playbackMode: 'host_only' | 'all_devices'
  playbackPaused: boolean
  historyAutoplay: boolean
  ownerName: string | null
  queueCount: number
  playCount: number
  currentTitle: string | null
  onlineParticipants: number
}

export type RoomDetail = Omit<RoomSummary, 'queueCount' | 'playCount' | 'currentTitle'> & {
  allowGuests: boolean
  ownerDiscordId: string | null
  participants: {
    id: string
    nickname: string
    discordId: string | null
    isMember: boolean
    isManager: boolean
    online: boolean
    leftAt: number | null
    createdAt: number
  }[]
  songs: {
    id: string
    title: string
    artist: string
    thumbnailUrl: string
    status: 'current' | 'queued' | 'played'
    isAutoplay: boolean
    startedAt: number | null
    createdAt: number
  }[]
}

export type UserSummary = {
  id: string
  discordId: string
  username: string
  displayName: string
  createdAt: number
  lastLoginAt: number
  ownedRooms: number
  activeSessions: number
}

export type AuditEntry = {
  id: string
  adminDiscordId: string
  action: 'room_paused' | 'room_resumed' | 'sessions_revoked' | 'room_user_records_deleted' | 'room_video_records_deleted'
  targetType: 'room' | 'user'
  targetId: string
  createdAt: number
}

export type UserPlaylist = {
  id: string
  name: string
  kind: 'favorites' | 'custom'
  trackCount: number
  createdAt: number
  updatedAt: number
}

export type UserPlaylistsPage = Page<UserPlaylist> & {
  user: Pick<UserSummary, 'id' | 'discordId' | 'username' | 'displayName'>
}

export type UserPlaylistTracksPage = Page<{
  videoId: string
  title: string
  artist: string
  durationSeconds: number
  thumbnailUrl: string
  addedAt: number
}> & { playlist: UserPlaylist }

export type RoomUserRecordsPreview = {
  code: string
  roomTitle: string
  target: { participantId: string; nickname: string; userId: string | null; discordId: string | null }
  counts: {
    participants: number
    songs: number
    queuedSongs: number
    currentSongs: number
    playedSongs: number
    plays: number
    votes: number
    messages: number
    events: number
  }
  revision: string
}

export type RoomVideo = {
  videoId: string
  title: string
  artist: string
  songs: number
  plays: number
  queuedSongs: number
  currentSongs: number
  failedSongs: number
  autoplayExcluded: boolean
  lastSeenAt: number
}

export type RoomVideoRecordsPreview = {
  code: string
  roomTitle: string
  target: Pick<RoomVideo, 'videoId' | 'title' | 'artist'>
  counts: {
    songs: number
    plays: number
    queuedSongs: number
    currentSongs: number
    failedSongs: number
    votes: number
    events: number
    autoplayExclusions: number
  }
  revision: string
}
