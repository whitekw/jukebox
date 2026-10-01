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
  action: 'room_paused' | 'room_resumed' | 'sessions_revoked'
  targetType: 'room' | 'user'
  targetId: string
  createdAt: number
}
