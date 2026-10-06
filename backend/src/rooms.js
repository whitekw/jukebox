const crypto = require('node:crypto')
const { transaction } = require('./db')
const { AppError } = require('./errors')
const { buildPlaybackSeries } = require('./roomStats')
const { extractYouTubeVideoId } = require('./youtube')
const { readRoomUserRecords, deleteRoomUserRecords } = require('./roomRecordCleanup')
const { readRoomVideoRecords, deleteRoomVideoRecords } = require('./roomVideoCleanup')

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const PLAYBACK_MODES = new Set(['host_only', 'all_devices'])
const PROFILE_SOURCES = new Set(['account', 'custom'])
const CHAT_MESSAGE_MAX_LENGTH = 300
const ROOM_TITLE_MAX_LENGTH = 60
const CHAT_HISTORY_LIMIT = 100
const ROOM_HISTORY_PAGE_SIZE = 30
const AUTOPLAY_MIN_HISTORY = 10
const AUTOPLAY_DURATION_LIMIT_SECONDS = 86_400
const AUTOPLAY_PREVIEW_SIZE = 20
const EARLY_SKIP_THRESHOLD_SECONDS = 10
const ABANDONED_SONG_GRACE_MS = 60_000
const ROOM_EVENT_TYPES = new Set([
  'song_added',
  'song_skipped',
  'song_removed',
  'queue_reordered',
  'playback_paused',
  'playback_resumed',
  'manager_added',
  'manager_removed',
])

function createToken() {
  return crypto.randomBytes(32).toString('base64url')
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token ?? '')).digest('hex')
}

function normalizeCode(code) {
  return String(code ?? '').trim().toUpperCase()
}

function generateCode(length = 6) {
  let code = ''
  for (let index = 0; index < length; index += 1) {
    code += ROOM_CODE_ALPHABET[crypto.randomInt(ROOM_CODE_ALPHABET.length)]
  }
  return code
}

function createRoomService(db, options = {}) {
  const now = options.now ?? Date.now

  const findRoom = db.prepare(
    'SELECT * FROM rooms WHERE code = ?',
  )
  const findParticipant = db.prepare(
    `SELECT participants.* FROM participants
     WHERE participants.room_id = ? AND participants.left_at IS NULL
       AND (participants.token_hash = ? OR EXISTS (
         SELECT 1 FROM participant_access_tokens AS access
         WHERE access.participant_id = participants.id AND access.token_hash = ?
       ))`,
  )
  const findAccountParticipant = db.prepare(
    'SELECT * FROM participants WHERE room_id = ? AND user_id = ? AND left_at IS NULL',
  )
  const findAllDevicesPlaybackRooms = db.prepare(
    `SELECT rooms.code
     FROM rooms
     WHERE rooms.playback_mode = 'all_devices'
       AND rooms.playback_paused = 0
       AND rooms.playback_pending = 0
       AND rooms.current_song_id IS NOT NULL`,
  )

  function getRoomRecord(code) {
    const room = findRoom.get(normalizeCode(code))
    if (!room) throw new AppError(404, '존재하지 않는 방입니다.', 'ROOM_NOT_FOUND')
    return room
  }

  function hasHostAccess(room, token) {
    if (room.playback_mode !== 'host_only' || !token || !room.host_token_hash) {
      return false
    }
    const suppliedHash = hashToken(token)
    const expected = Buffer.from(room.host_token_hash, 'hex')
    const supplied = Buffer.from(suppliedHash, 'hex')
    return (
      expected.length === supplied.length &&
      crypto.timingSafeEqual(expected, supplied)
    )
  }

  function hasOwnerAccess(room, userId) {
    return Boolean(userId && room.owner_user_id === String(userId))
  }

  function participantForCredentials(room, token, userId) {
    const accountParticipant = userId
      ? findAccountParticipant.get(room.id, String(userId))
      : null
    if (accountParticipant) return accountParticipant
    const tokenParticipant = token
      ? findParticipant.get(room.id, hashToken(token), hashToken(token))
      : null
    if (tokenParticipant && (!tokenParticipant.user_id || tokenParticipant.user_id === String(userId ?? ''))) {
      return tokenParticipant
    }
    return null
  }

  function requireParticipant(room, token, userId) {
    const participant = participantForCredentials(room, token, userId)
    if (!participant) {
      throw new AppError(401, '이 방에 다시 참여해주세요.', 'PARTICIPANT_REQUIRED')
    }
    return participant
  }

  function requireManager(room, token, userId) {
    const participant = requireParticipant(room, token, userId)
    if (!participant.user_id || !participant.is_manager) {
      throw new AppError(403, '관리 권한이 없습니다.', 'MANAGER_FORBIDDEN')
    }
    return participant
  }

  function requireController(room, credentials = {}) {
    const normalizedCredentials =
      typeof credentials === 'string'
        ? { hostToken: credentials }
        : credentials ?? {}
    if (hasHostAccess(room, normalizedCredentials.hostToken)) return
    if (hasOwnerAccess(room, normalizedCredentials.userId)) return
    if (normalizedCredentials.participantToken || normalizedCredentials.userId) {
      requireManager(room, normalizedCredentials.participantToken, normalizedCredentials.userId)
      return
    }
    if (normalizedCredentials.hostToken) {
      throw new AppError(403, '호스트 권한이 없습니다.', 'HOST_FORBIDDEN')
    }
    throw new AppError(403, '관리 권한이 없습니다.', 'CONTROL_FORBIDDEN')
  }

  function otherControlAvailableAt(requester) {
    if (!requester) return null
    if (requester.left_at != null) return Number(requester.left_at)
    if (requester.offline_since != null) {
      return Number(requester.offline_since) + ABANDONED_SONG_GRACE_MS
    }
    return null
  }

  function requireSongControl(room, credentials, addedByParticipantId) {
    const normalizedCredentials =
      typeof credentials === 'string'
        ? { hostToken: credentials }
        : credentials ?? {}
    if (hasHostAccess(room, normalizedCredentials.hostToken)) return
    if (hasOwnerAccess(room, normalizedCredentials.userId)) return
    if (normalizedCredentials.participantToken || normalizedCredentials.userId) {
      const participant = requireParticipant(
        room,
        normalizedCredentials.participantToken,
        normalizedCredentials.userId,
      )
      if (
        (participant.user_id && participant.is_manager) ||
        participant.id === addedByParticipantId
      ) {
        return
      }
      const requester = db.prepare(
        'SELECT left_at, offline_since FROM participants WHERE id = ? AND room_id = ?',
      ).get(addedByParticipantId, room.id)
      const availableAt = otherControlAvailableAt(requester)
      if (availableAt !== null && now() >= availableAt) return
      throw new AppError(
        403,
        '본인이 신청한 곡만 삭제하거나 건너뛸 수 있습니다.',
        'SONG_CONTROL_FORBIDDEN',
      )
    }
    if (normalizedCredentials.hostToken) {
      throw new AppError(403, '호스트 권한이 없습니다.', 'HOST_FORBIDDEN')
    }
    throw new AppError(401, '이 방에 다시 참여해주세요.', 'PARTICIPANT_REQUIRED')
  }

  function getSessionIdentity(room, credentials = {}) {
    const normalizedCredentials =
      typeof credentials === 'string'
        ? { hostToken: credentials }
        : credentials ?? {}
    const isHost = hasHostAccess(room, normalizedCredentials.hostToken)
    const isOwner = hasOwnerAccess(room, normalizedCredentials.userId)
    const participant = participantForCredentials(
      room,
      normalizedCredentials.participantToken,
      normalizedCredentials.userId,
    )
    return { isHost, isOwner, participant }
  }

  function hasActiveSession(code, credentials = {}) {
    const room = getRoomRecord(code)
    const identity = getSessionIdentity(room, credentials)
    return identity.isHost || identity.isOwner || Boolean(identity.participant)
  }

  function getPresenceIdentity(code, credentials = {}) {
    const room = getRoomRecord(code)
    const identity = getSessionIdentity(room, credentials)
    return {
      isHost: identity.isHost,
      isOwner: identity.isOwner,
      participantId: identity.participant?.id ?? null,
    }
  }

  function serializeSong(row) {
    if (!row) return null
    return {
      id: row.id,
      videoId: row.video_id,
      title: row.title,
      artist: row.artist,
      durationSeconds: row.duration_seconds,
      thumbnailUrl: row.thumbnail_url,
      addedBy: row.nickname,
      addedById: row.added_by,
      addedByAvatarUrl: row.avatar_url ?? null,
      isAutoplay: Boolean(row.is_autoplay),
      otherControlAvailableAt: otherControlAvailableAt(row),
      position: row.position,
      upvotes: Number(row.upvotes ?? 0),
      downvotes: Number(row.downvotes ?? 0),
      voteRevision: Number(row.vote_revision ?? 0),
    }
  }

  function getAutoplayHistoryCount(roomId) {
    return Number(db.prepare(
      "SELECT COUNT(*) AS count FROM songs WHERE room_id = ? AND status = 'played' AND is_autoplay = 0 AND play_count_excluded = 0",
    ).get(roomId).count)
  }

  function getAutoplayFilters(room) {
    return {
      excludedWords: JSON.parse(room.autoplay_excluded_words),
      excludedVideoIds: JSON.parse(room.autoplay_excluded_video_ids),
      minDurationSeconds: room.autoplay_min_duration_seconds,
      maxDurationSeconds: room.autoplay_max_duration_seconds,
    }
  }

  function getAutoplayHistoryVideos(room, includeAllDurations = false) {
    return db.prepare(
      `SELECT video_id, title, artist, duration_seconds, thumbnail_url, started_at FROM (
         SELECT video_id, title, artist, duration_seconds, thumbnail_url, started_at,
                rowid AS source_rowid,
                ROW_NUMBER() OVER (PARTITION BY video_id ORDER BY started_at DESC, rowid DESC) AS rank
         FROM songs
         WHERE room_id = ? AND status = 'played' AND is_autoplay = 0
           AND play_count_excluded = 0
           AND duration_seconds BETWEEN ? AND ?
       ) WHERE rank = 1 ORDER BY started_at DESC, source_rowid DESC`,
    ).all(room.id, includeAllDurations ? 1 : Math.max(1, room.autoplay_min_duration_seconds),
      includeAllDurations ? AUTOPLAY_DURATION_LIMIT_SECONDS : room.autoplay_max_duration_seconds)
  }

  function getAutoplayCandidates(room) {
    const { excludedWords, excludedVideoIds } = getAutoplayFilters(room)
    const excludedIds = new Set(excludedVideoIds)
    for (const { video_id } of db.prepare(
      'SELECT DISTINCT video_id FROM songs WHERE room_id = ? AND playback_error_code IS NOT NULL',
    ).all(room.id)) excludedIds.add(video_id)
    const words = excludedWords.map((word) => word.normalize('NFKC').toLocaleLowerCase())
    return getAutoplayHistoryVideos(room).filter(({ video_id, title }) => {
        if (excludedIds.has(video_id)) return false
        const normalizedTitle = title.normalize('NFKC').toLocaleLowerCase()
        return !words.some((word) => normalizedTitle.includes(word))
      })
  }

  function listAutoplayHistoryVideos(code, ownerUserId, query = '', offset = 0) {
    const room = getRoomRecord(code)
    if (!hasOwnerAccess(room, ownerUserId)) {
      throw new AppError(403, '방 소유자만 이 설정을 변경할 수 있습니다.', 'OWNER_FORBIDDEN')
    }
    if (typeof query !== 'string' || query.length > 100 ||
      !Number.isInteger(Number(offset)) || Number(offset) < 0 || Number(offset) > 100000) {
      throw new AppError(400, '자동 재생 영상 검색 조건이 올바르지 않습니다.', 'INVALID_AUTOPLAY_SEARCH')
    }
    const videos = getAutoplayHistoryVideos(room)
    const search = query.trim().normalize('NFKC').toLocaleLowerCase()
    const matches = search ? videos.filter(({ title, artist }) =>
      `${title} ${artist}`.normalize('NFKC').toLocaleLowerCase().includes(search)) : videos
    const start = Number(offset)
    const pageSize = 30
    const excludedIds = new Set(getAutoplayFilters(room).excludedVideoIds)
    const toItem = (video) => ({
      videoId: video.video_id,
      title: video.title,
      artist: video.artist,
      thumbnailUrl: video.thumbnail_url,
      durationSeconds: video.duration_seconds,
      startedAt: Number(video.started_at),
    })
    return {
      items: matches.slice(start, start + pageSize).map(toItem),
      nextOffset: start + pageSize < matches.length ? start + pageSize : null,
      excludedVideos: getAutoplayHistoryVideos(room, true)
        .filter(({ video_id }) => excludedIds.has(video_id)).map(toItem),
    }
  }

  function getAutoplaySuggestions(room, avoidFirstVideoId = null) {
    if (!room.history_autoplay || getAutoplayHistoryCount(room.id) < AUTOPLAY_MIN_HISTORY) return []
    // Keep the order in the database so starting a song only shifts the preview by one.
    const queuedVideos = new Set(db.prepare(
      "SELECT video_id FROM songs WHERE room_id = ? AND status = 'queued'",
    ).all(room.id).map(({ video_id }) => video_id))
    const pending = db.prepare(
      'SELECT * FROM room_autoplay_suggestions WHERE room_id = ? ORDER BY position',
    ).all(room.id)
    const removeSuggestion = db.prepare('DELETE FROM room_autoplay_suggestions WHERE id = ?')
    const candidates = getAutoplayCandidates(room)
    const eligibleVideoIds = new Set(candidates.map(({ video_id }) => video_id))
    const seenVideos = new Set()
    const suggestions = pending.filter((suggestion) => {
      if (!eligibleVideoIds.has(suggestion.video_id) || queuedVideos.has(suggestion.video_id) || seenVideos.has(suggestion.video_id)) {
        removeSuggestion.run(suggestion.id)
        return false
      }
      seenVideos.add(suggestion.video_id)
      return true
    })
    const currentVideoId = room.current_song_id
      ? db.prepare('SELECT video_id FROM songs WHERE id = ?').get(room.current_song_id)?.video_id
      : null
    const availableCandidates = candidates.filter(({ video_id }) => !queuedVideos.has(video_id))
    const alternatives = availableCandidates.filter(({ video_id }) => video_id !== currentVideoId)
    const choices = alternatives.length ? alternatives : availableCandidates
    const recentVideos = new Set(db.prepare(
      `SELECT video_id FROM songs WHERE room_id = ? AND status = 'played'
       ORDER BY started_at DESC, rowid DESC LIMIT ?`,
    ).all(room.id, room.current_song_id ? 4 : 5).map(({ video_id }) => video_id))
    const insertSuggestion = db.prepare(
      `INSERT INTO room_autoplay_suggestions
       (id, room_id, position, video_id, title, artist, duration_seconds, thumbnail_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    let position = suggestions.at(-1)?.position ?? 0
    while (suggestions.length < AUTOPLAY_PREVIEW_SIZE) {
      let pool = choices.filter(({ video_id }) => !seenVideos.has(video_id))
      if (!pool.length) break
      if (suggestions.length === 0 && avoidFirstVideoId) {
        const alternatives = pool.filter(({ video_id }) => video_id !== avoidFirstVideoId)
        if (alternatives.length) pool = alternatives
      }
      const nonRecent = pool.filter(({ video_id }) => !recentVideos.has(video_id))
      if (nonRecent.length) pool = nonRecent
      const candidate = pool[crypto.randomInt(pool.length)]
      const suggestion = { id: crypto.randomUUID(), position: ++position, ...candidate }
      insertSuggestion.run(suggestion.id, room.id, suggestion.position, candidate.video_id,
        candidate.title, candidate.artist, candidate.duration_seconds, candidate.thumbnail_url)
      suggestions.push(suggestion)
      seenVideos.add(candidate.video_id)
    }
    return suggestions.map((suggestion) => ({
      id: suggestion.id,
      videoId: suggestion.video_id,
      title: suggestion.title,
      artist: suggestion.artist,
      durationSeconds: suggestion.duration_seconds,
      thumbnailUrl: suggestion.thumbnail_url,
    }))
  }

  function ensureAutoplayParticipant(room, createdAt) {
    const id = `autoplay:${room.id}`
    db.prepare(
      `INSERT OR IGNORE INTO participants
       (id, room_id, token_hash, nickname, left_at, created_at)
       VALUES (?, ?, ?, '자동 재생', ?, ?)`,
    ).run(id, room.id, crypto.randomBytes(32).toString('hex'), createdAt, createdAt)
    return id
  }

  function serializeFeedEntry(row) {
    let eventData = {}
    if (row.event_data) {
      try {
        eventData = JSON.parse(row.event_data)
      } catch {
        eventData = {}
      }
    }
    return {
      id: row.id,
      sequence: Number(row.sequence),
      type: row.entry_type,
      participantId: row.participant_id ?? null,
      nickname: row.nickname ?? null,
      actorType: row.actor_type,
      ...(row.entry_type === 'message'
        ? { content: row.content }
        : { eventType: row.event_type, data: eventData }),
      createdAt: Number(row.created_at),
    }
  }

  function listChatMessages(code, participantToken, userId) {
    const room = getRoomRecord(code)
    requireParticipant(room, participantToken, userId)
    const recentEntries = db.prepare(
      `SELECT * FROM room_feed_entries
       WHERE room_id = ? AND entry_type = ?
         AND (event_type IS NULL OR event_type NOT IN ('participant_joined', 'participant_left'))
       ORDER BY sequence DESC
       LIMIT ?`,
    )
    return [
      ...recentEntries.all(room.id, 'message', CHAT_HISTORY_LIMIT),
      ...recentEntries.all(room.id, 'system', CHAT_HISTORY_LIMIT),
    ]
      .sort((left, right) => left.sequence - right.sequence)
      .map(serializeFeedEntry)
  }

  function addChatMessage(code, participantToken, content, userId) {
    const normalizedContent =
      typeof content === 'string' ? content.trim() : ''
    if (
      normalizedContent.length === 0 ||
      normalizedContent.length > CHAT_MESSAGE_MAX_LENGTH
    ) {
      throw new AppError(
        400,
        `메시지는 1~${CHAT_MESSAGE_MAX_LENGTH}자로 입력해주세요.`,
        'INVALID_CHAT_MESSAGE',
      )
    }

    return transaction(db, () => {
      const room = getRoomRecord(code)
      const participant = requireParticipant(room, participantToken, userId)
      const message = {
        id: crypto.randomUUID(),
        participantId: participant.id,
        nickname: participant.nickname,
        content: normalizedContent,
        createdAt: now(),
      }
      const result = db.prepare(
        `INSERT INTO room_feed_entries (
           id, room_id, entry_type, participant_id, nickname, actor_type,
           content, created_at
         ) VALUES (?, ?, 'message', ?, ?, 'participant', ?, ?)`,
      ).run(
        message.id,
        room.id,
        message.participantId,
        message.nickname,
        message.content,
        message.createdAt,
      )
      return {
        ...message,
        type: 'message',
        actorType: 'participant',
        sequence: Number(result.lastInsertRowid),
      }
    })
  }

  function addRoomEvent(code, eventType, actor = {}, data = {}) {
    if (!ROOM_EVENT_TYPES.has(eventType)) {
      throw new Error(`Unsupported room event type: ${eventType}`)
    }

    return transaction(db, () => {
      const room = getRoomRecord(code)
      let participant = null
      let actorType = 'system'

      if (actor.participantToken || actor.userId) {
        participant = requireParticipant(room, actor.participantToken, actor.userId)
        actorType = 'participant'
      } else if (actor.participantId) {
        participant = db
          .prepare('SELECT * FROM participants WHERE id = ? AND room_id = ?')
          .get(String(actor.participantId), room.id)
        if (!participant) {
          throw new AppError(
            404,
            '참여자를 찾지 못했습니다.',
            'PARTICIPANT_NOT_FOUND',
          )
        }
        actorType = 'participant'
      } else if (actor.hostToken) {
        if (!hasHostAccess(room, actor.hostToken)) {
          throw new AppError(403, '호스트 권한이 없습니다.', 'HOST_FORBIDDEN')
        }
        actorType = 'host'
      }

      const entry = {
        id: crypto.randomUUID(),
        type: 'system',
        participantId: participant?.id ?? null,
        nickname: participant?.nickname ?? null,
        actorType,
        eventType,
        data: data && typeof data === 'object' ? data : {},
        createdAt: now(),
      }
      const result = db.prepare(
        `INSERT INTO room_feed_entries (
           id, room_id, entry_type, participant_id, nickname, actor_type,
           event_type, event_data, created_at
         ) VALUES (?, ?, 'system', ?, ?, ?, ?, ?, ?)`,
      ).run(
        entry.id,
        room.id,
        entry.participantId,
        entry.nickname,
        entry.actorType,
        entry.eventType,
        JSON.stringify(entry.data),
        entry.createdAt,
      )
      return { ...entry, sequence: Number(result.lastInsertRowid) }
    })
  }

  function getPlaybackPosition(room, at = now()) {
    if (!room.current_song_id) return 0
    const position = Number(room.playback_position_seconds)
    if (room.playback_paused || room.playback_blocked || room.playback_pending) {
      return position
    }
    const elapsedSeconds = Math.max(0, at - Number(room.playback_anchor_at)) / 1000
    return position + elapsedSeconds
  }

  function getPublicRoom(code) {
    const room = getRoomRecord(code)
    const serverTime = now()
    const current = room.current_song_id
      ? db
          .prepare(
            `SELECT songs.*, participants.nickname, participants.avatar_url,
                    participants.left_at, participants.offline_since,
                    (SELECT COUNT(*) FROM song_votes WHERE song_id = songs.id AND vote = 1) AS upvotes,
                    (SELECT COUNT(*) FROM song_votes WHERE song_id = songs.id AND vote = -1) AS downvotes
             FROM songs
             JOIN participants ON participants.id = songs.added_by
             WHERE songs.id = ?`,
          )
          .get(room.current_song_id)
      : null
    const queue = db
      .prepare(
        `SELECT songs.*, participants.nickname, participants.avatar_url,
                participants.left_at, participants.offline_since
         FROM songs
         JOIN participants ON participants.id = songs.added_by
         WHERE songs.room_id = ? AND songs.status = 'queued'
         ORDER BY songs.position ASC, songs.created_at ASC`,
      )
      .all(room.id)
    const participants = db
      .prepare(
        `SELECT id, nickname, avatar_url, is_manager, user_id
         FROM participants
         WHERE room_id = ? AND left_at IS NULL
         ORDER BY created_at ASC, rowid ASC`,
      )
      .all(room.id)

    return {
      code: room.code,
      title: room.title,
      allowGuests: Boolean(room.allow_guests),
      historyAutoplay: Boolean(room.history_autoplay),
      autoplayHistoryCount: getAutoplayHistoryCount(room.id),
      autoplayPoolCount: getAutoplayCandidates(room).length,
      autoplayFilters: getAutoplayFilters(room),
      autoplaySuggestions: getAutoplaySuggestions(room),
      hostVolume: room.host_volume,
      playbackMode: room.playback_mode,
      playbackPaused: Boolean(room.playback_paused),
      playbackBlocked: Boolean(room.playback_blocked),
      playbackPositionSeconds: Number(room.playback_position_seconds),
      playbackAnchorAt: Number(room.playback_anchor_at),
      playbackPending: Boolean(room.playback_pending),
      playbackRevision: Number(room.playback_revision),
      serverTime,
      participants: participants.map((participant) => ({
        id: participant.id,
        nickname: participant.nickname,
        avatarUrl: participant.avatar_url ?? null,
        isManager: Boolean(participant.user_id && participant.is_manager),
        isMember: Boolean(participant.user_id),
        isOwner: Boolean(participant.user_id && participant.user_id === room.owner_user_id),
      })),
      currentSong: serializeSong(current),
      queue: queue.map(serializeSong),
    }
  }

  function requireCurrentSong(room, songId) {
    if (!room.current_song_id || room.current_song_id !== songId) {
      throw new AppError(409, '현재 재생 중인 곡에만 투표할 수 있습니다.', 'SONG_NOT_CURRENT')
    }
    const song = db.prepare(
      `SELECT songs.id, songs.added_by, participants.user_id AS requester_user_id
       FROM songs
       JOIN participants ON participants.id = songs.added_by
       WHERE songs.id = ? AND songs.room_id = ? AND songs.status = 'current'`,
    ).get(songId, room.id)
    if (!song) {
      throw new AppError(409, '현재 재생 중인 곡에만 투표할 수 있습니다.', 'SONG_NOT_CURRENT')
    }
    return song
  }

  function isOwnSongRequest(song, participant) {
    return song.added_by === participant.id || Boolean(
      participant.user_id && song.requester_user_id === participant.user_id,
    )
  }

  function getRoomStats(code, credentials, timeZone = 'UTC') {
    const room = getRoomRecord(code)
    requireParticipant(room, credentials?.participantToken, credentials?.userId)
    if (typeof timeZone !== 'string' || timeZone.length > 100) {
      throw new AppError(400, '시간대가 올바르지 않습니다.', 'INVALID_TIME_ZONE')
    }
    const plays = db.prepare(
      'SELECT started_at, started_at_estimated, added_by, is_autoplay FROM songs WHERE room_id = ? AND started_at IS NOT NULL AND play_count_excluded = 0',
    ).all(room.id)
    let series
    const statsNow = now()
    try {
      series = buildPlaybackSeries(plays.map(({ started_at }) => Number(started_at)), statsNow, timeZone)
    } catch (error) {
      if (!(error instanceof RangeError)) throw error
      throw new AppError(400, '시간대가 올바르지 않습니다.', 'INVALID_TIME_ZONE')
    }
    const voters = db.prepare(
      `SELECT song_votes.requester_participant_id,
              SUM(CASE WHEN song_votes.vote = 1 THEN 1 ELSE 0 END) AS upvotes,
              SUM(CASE WHEN song_votes.vote = -1 THEN 1 ELSE 0 END) AS downvotes
       FROM song_votes
       JOIN songs ON songs.id = song_votes.song_id
       WHERE song_votes.room_id = ? AND songs.is_autoplay = 0 AND songs.playback_error_code IS NULL
       GROUP BY song_votes.requester_participant_id`,
    ).all(room.id)
    const byParticipant = new Map()
    for (const play of plays) {
      if (play.is_autoplay) continue
      const totals = byParticipant.get(play.added_by) ?? { plays: 0, upvotes: 0, downvotes: 0, timestamps: [] }
      totals.plays += 1
      totals.timestamps.push(Number(play.started_at))
      byParticipant.set(play.added_by, totals)
    }
    for (const voter of voters) {
      const totals = byParticipant.get(voter.requester_participant_id) ?? {
        plays: 0, upvotes: 0, downvotes: 0, timestamps: [],
      }
      totals.upvotes += Number(voter.upvotes)
      totals.downvotes += Number(voter.downvotes)
      byParticipant.set(voter.requester_participant_id, totals)
    }
    const participantRecords = db.prepare(
      'SELECT id, user_id, nickname, avatar_url, left_at FROM participants WHERE room_id = ? AND user_id IS NOT NULL ORDER BY created_at ASC, rowid ASC',
    ).all(room.id)
    const grouped = new Map()
    for (const record of participantRecords) {
      const key = record.user_id ? `account:${record.user_id}` : `guest:${record.id}`
      const totals = byParticipant.get(record.id) ?? { plays: 0, upvotes: 0, downvotes: 0, timestamps: [] }
      const existing = grouped.get(key)
      grouped.set(key, {
        id: record.id,
        nickname: record.nickname,
        avatarUrl: record.avatar_url ?? null,
        active: existing?.active || record.left_at === null,
        plays: (existing?.plays ?? 0) + totals.plays,
        upvotes: (existing?.upvotes ?? 0) + totals.upvotes,
        downvotes: (existing?.downvotes ?? 0) + totals.downvotes,
        timestamps: [...(existing?.timestamps ?? []), ...totals.timestamps],
      })
    }
    const participants = [...grouped.values()]
      .filter((participant) => participant.active || participant.plays > 0 || participant.upvotes > 0 || participant.downvotes > 0)
      .sort((left, right) => right.plays - left.plays || right.upvotes - left.upvotes ||
        left.nickname.localeCompare(right.nickname))
      .map(({ active, timestamps, ...participant }) => ({
        ...participant,
        ...buildPlaybackSeries(timestamps, statsNow, timeZone),
      }))
    return {
      totalPlays: plays.length,
      totalUpvotes: voters.reduce((total, row) => total + Number(row.upvotes), 0),
      totalDownvotes: voters.reduce((total, row) => total + Number(row.downvotes), 0),
      hasEstimatedHistory: plays.some(({ started_at_estimated }) => Boolean(started_at_estimated)),
      timeZone,
      ...series,
      participants,
    }
  }

  function getRoomHistory(code, credentials, before = null, limit = ROOM_HISTORY_PAGE_SIZE, requesterIds = [], query = '') {
    const room = getRoomRecord(code)
    requireParticipant(room, credentials?.participantToken, credentials?.userId)
    const pageSize = Number(limit)
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
      throw new AppError(400, '조회할 기록 수가 올바르지 않습니다.', 'INVALID_HISTORY_LIMIT')
    }
    if (typeof query !== 'string' || query.length > 100) {
      throw new AppError(400, '재생 기록 검색 조건이 올바르지 않습니다.', 'INVALID_HISTORY_SEARCH')
    }
    const search = query.trim()
    const requestedIds = requesterIds == null ? [] : Array.isArray(requesterIds) ? requesterIds : [requesterIds]
    if (requestedIds.length > 100 || requestedIds.some((id) => typeof id !== 'string' || !id || id.length > 100)) {
      throw new AppError(400, '신청자 검색 조건이 올바르지 않습니다.', 'INVALID_HISTORY_REQUESTER')
    }
    const uniqueRequesterIds = [...new Set(requestedIds)]
    if (uniqueRequesterIds.length && db.prepare(
      `SELECT COUNT(*) AS count FROM participants WHERE room_id = ?
       AND id IN (${uniqueRequesterIds.map(() => '?').join(', ')})`,
    ).get(room.id, ...uniqueRequesterIds).count !== uniqueRequesterIds.length) {
      throw new AppError(400, '신청자 검색 조건이 올바르지 않습니다.', 'INVALID_HISTORY_REQUESTER')
    }
    let cursor = null
    if (before !== null && before !== undefined) {
      if (typeof before !== 'string' || !before || before.length > 100) {
        throw new AppError(400, '재생 기록 위치가 올바르지 않습니다.', 'INVALID_HISTORY_CURSOR')
      }
      cursor = db.prepare(
        `SELECT started_at, rowid FROM songs
         WHERE room_id = ? AND id = ? AND status = 'played' AND started_at IS NOT NULL`,
      ).get(room.id, before)
      if (!cursor) {
        throw new AppError(400, '재생 기록 위치가 올바르지 않습니다.', 'INVALID_HISTORY_CURSOR')
      }
    }
    const rows = db.prepare(
      `SELECT songs.id, songs.video_id, songs.title, songs.artist, songs.thumbnail_url,
              songs.started_at, songs.started_at_estimated, songs.is_autoplay, songs.play_count_excluded,
              participants.nickname AS requester, participants.avatar_url AS requester_avatar_url
       FROM songs JOIN participants ON participants.id = songs.added_by
       WHERE songs.room_id = ? AND songs.status = 'played' AND songs.started_at IS NOT NULL
         ${uniqueRequesterIds.length
    ? `AND songs.added_by IN (${uniqueRequesterIds.map(() => '?').join(', ')}) AND songs.is_autoplay = 0`
    : ''}
         ${search ? `AND (instr(lower(songs.title), lower(?)) > 0
           OR instr(lower(songs.artist), lower(?)) > 0 OR instr(lower(songs.video_id), lower(?)) > 0)` : ''}
         AND (? IS NULL OR songs.started_at < ?
           OR (songs.started_at = ? AND songs.rowid < ?))
       ORDER BY songs.started_at DESC, songs.rowid DESC
       LIMIT ?`,
    ).all(room.id, ...uniqueRequesterIds, ...(search ? [search, search, search] : []),
      cursor?.started_at ?? null, cursor?.started_at ?? null,
      cursor?.started_at ?? null, cursor?.rowid ?? null, pageSize + 1)
    const page = rows.slice(0, pageSize)
    const requesters = db.prepare(
      `SELECT participants.id, participants.nickname, participants.avatar_url, COUNT(*) AS plays
       FROM songs JOIN participants ON participants.id = songs.added_by
       WHERE songs.room_id = ? AND songs.status = 'played' AND songs.is_autoplay = 0
         AND songs.started_at IS NOT NULL
       GROUP BY participants.id ORDER BY MAX(songs.started_at) DESC, MAX(songs.rowid) DESC`,
    ).all(room.id)
    return {
      items: page.map((row) => ({
        id: row.id,
        videoId: row.video_id,
        title: row.title,
        artist: row.artist,
        thumbnailUrl: row.thumbnail_url,
        requester: row.requester,
        requesterAvatarUrl: row.requester_avatar_url ?? null,
        isAutoplay: Boolean(row.is_autoplay),
        startedAt: Number(row.started_at),
        startedAtEstimated: Boolean(row.started_at_estimated),
        countedAsPlay: !row.play_count_excluded,
      })),
      nextCursor: rows.length > pageSize ? page.at(-1).id : null,
      requesters: requesters.map((row) => ({
        id: row.id,
        nickname: row.nickname,
        avatarUrl: row.avatar_url ?? null,
        plays: Number(row.plays),
      })),
    }
  }

  function getSongVote(code, credentials, songId) {
    const room = getRoomRecord(code)
    const participant = requireParticipant(room, credentials?.participantToken, credentials?.userId)
    const song = requireCurrentSong(room, songId)
    const row = db.prepare(
      'SELECT vote FROM song_votes WHERE song_id = ? AND voter_participant_id = ?',
    ).get(songId, participant.id)
    return {
      vote: row?.vote === 1 ? 'up' : row?.vote === -1 ? 'down' : null,
      canVote: !isOwnSongRequest(song, participant),
    }
  }

  function setSongVote(code, credentials, songId, vote) {
    if (vote !== 'up' && vote !== 'down' && vote !== null) {
      throw new AppError(400, '추천 또는 비추천을 선택해주세요.', 'INVALID_SONG_VOTE')
    }
    return transaction(db, () => {
      const room = getRoomRecord(code)
      const participant = requireParticipant(room, credentials?.participantToken, credentials?.userId)
      const song = requireCurrentSong(room, songId)
      if (isOwnSongRequest(song, participant)) {
        throw new AppError(403, '본인이 신청한 곡에는 투표할 수 없습니다.', 'SELF_VOTE_FORBIDDEN')
      }
      const existing = db.prepare(
        'SELECT vote FROM song_votes WHERE song_id = ? AND voter_participant_id = ?',
      ).get(songId, participant.id)
      const nextValue = vote === 'up' ? 1 : vote === 'down' ? -1 : null
      if ((existing?.vote ?? null) === nextValue) return getPublicRoom(code)

      if (nextValue === null) {
        db.prepare('DELETE FROM song_votes WHERE song_id = ? AND voter_participant_id = ?')
          .run(songId, participant.id)
      } else {
        const changedAt = now()
        db.prepare(
          `INSERT INTO song_votes (
             room_id, song_id, requester_participant_id, voter_participant_id,
             vote, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(song_id, voter_participant_id) DO UPDATE SET
             vote = excluded.vote, updated_at = excluded.updated_at`,
        ).run(room.id, songId, song.added_by, participant.id, nextValue, changedAt, changedAt)
      }
      db.prepare('UPDATE songs SET vote_revision = vote_revision + 1 WHERE id = ?').run(songId)
      return getPublicRoom(code)
    })
  }

  function normalizeNickname(nickname) {
    const normalizedNickname = String(nickname ?? '').trim()
    if (normalizedNickname.length < 1 || normalizedNickname.length > 20) {
      throw new AppError(400, '닉네임은 1~20자로 입력해주세요.', 'INVALID_NICKNAME')
    }
    return normalizedNickname
  }

  function normalizeRoomTitle(title) {
    if (typeof title !== 'string') {
      throw new AppError(400, '방 제목이 올바르지 않습니다.', 'INVALID_ROOM_TITLE')
    }
    const normalized = title.trim()
    if (normalized.length > ROOM_TITLE_MAX_LENGTH) {
      throw new AppError(400, '방 제목은 60자 이하여야 합니다.', 'INVALID_ROOM_TITLE')
    }
    return normalized
  }

  function insertParticipant(
    room,
    {
      nickname: normalizedNickname,
      userId = null,
      profileSource = 'custom',
      avatarUrl = null,
      isManager = false,
    },
  ) {
    if (!PROFILE_SOURCES.has(profileSource)) {
      throw new AppError(
        400,
        '프로필 방식이 올바르지 않습니다.',
        'INVALID_PROFILE_SOURCE',
      )
    }
    if (profileSource === 'account' && !userId) {
      throw new AppError(
        401,
        '계정 프로필을 사용하려면 로그인해주세요.',
        'AUTH_REQUIRED',
      )
    }
    const participantToken = createToken()
    const participant = {
      id: crypto.randomUUID(),
      roomId: room.id,
      tokenHash: hashToken(participantToken),
      nickname: normalizedNickname,
      userId: userId ? String(userId) : null,
      profileSource,
      avatarUrl:
        profileSource === 'account' && avatarUrl ? String(avatarUrl) : null,
      isManager,
      createdAt: now(),
    }
    db.prepare(
      `INSERT INTO participants (
        id, room_id, token_hash, nickname, user_id, profile_source,
        avatar_url, is_manager, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      participant.id,
      participant.roomId,
      participant.tokenHash,
      participant.nickname,
      participant.userId,
      participant.profileSource,
      participant.avatarUrl,
      participant.isManager ? 1 : 0,
      participant.createdAt,
    )
    return {
      participantToken,
      participant: {
        id: participant.id,
        nickname: participant.nickname,
        avatarUrl: participant.avatarUrl,
        isManager: participant.isManager,
        isMember: Boolean(participant.userId),
      },
    }
  }

  function createRoom({
    playbackMode = 'host_only',
    title = '',
    allowGuests = true,
    ownerUserId = null,
    nickname,
    participantUserId = null,
    profileSource = 'custom',
    avatarUrl = null,
  } = {}) {
    if (!PLAYBACK_MODES.has(playbackMode)) {
      throw new AppError(
        400,
        '재생 방식이 올바르지 않습니다.',
        'INVALID_PLAYBACK_MODE',
      )
    }
    if (!ownerUserId) {
      throw new AppError(
        401,
        '방을 만들려면 로그인해주세요.',
        'AUTH_REQUIRED',
      )
    }
    const normalizedNickname =
      nickname === undefined ? null : normalizeNickname(nickname)
    const normalizedTitle = normalizeRoomTitle(title)
    if (typeof allowGuests !== 'boolean') {
      throw new AppError(400, '비로그인 참여 설정이 올바르지 않습니다.', 'INVALID_ALLOW_GUESTS')
    }

    return transaction(db, () => {
      let code
      do {
        code = generateCode()
      } while (db.prepare('SELECT 1 FROM rooms WHERE code = ?').get(code))

      const id = crypto.randomUUID()
      const hostToken = playbackMode === 'host_only' ? createToken() : null
      const createdAt = now()
      db.prepare(
        `INSERT INTO rooms (
          id, code, title, allow_guests, host_token_hash, owner_user_id,
          playback_mode, playback_anchor_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        code,
        normalizedTitle || code,
        allowGuests ? 1 : 0,
        hostToken ? hashToken(hostToken) : '',
        String(ownerUserId),
        playbackMode,
        createdAt,
        createdAt,
      )

      const joined = normalizedNickname
        ? insertParticipant(getRoomRecord(code), {
            nickname: normalizedNickname,
            userId: participantUserId,
            profileSource,
            avatarUrl,
            isManager: Boolean(participantUserId),
          })
        : null
      return {
        code,
        ...(hostToken ? { hostToken } : {}),
        playbackMode,
        ...(joined ?? {}),
      }
    })
  }

  function listOwnedRooms(userId) {
    if (!userId) return []
    return db
      .prepare(
        `SELECT code
         FROM rooms
         WHERE owner_user_id = ?
         ORDER BY created_at DESC`,
      )
      .all(String(userId))
      .map(({ code }) => getPublicRoom(code))
  }

  function listJoinedRooms(userId) {
    if (!userId) return []
    return db
      .prepare(
        `SELECT rooms.code FROM rooms
         JOIN participants ON participants.room_id = rooms.id
         WHERE participants.user_id = ? AND participants.left_at IS NULL
           AND rooms.owner_user_id <> ?
         ORDER BY participants.created_at DESC`,
      )
      .all(String(userId), String(userId))
      .map(({ code }) => getPublicRoom(code))
  }

  function deleteOwnedRoom(code, userId, confirmationName) {
    if (!userId) {
      throw new AppError(401, '로그인이 필요합니다.', 'AUTH_REQUIRED')
    }
    return transaction(db, () => {
      const room = getRoomRecord(code)
      if (room.owner_user_id !== String(userId)) {
        throw new AppError(
          403,
          '방 소유자만 방을 삭제할 수 있습니다.',
          'OWNER_FORBIDDEN',
        )
      }
      if (confirmationName !== (room.title || room.code)) {
        throw new AppError(
          400,
          '방 이름을 정확히 입력해주세요.',
          'ROOM_DELETE_NAME_MISMATCH',
        )
      }
      db.prepare('DELETE FROM rooms WHERE id = ?').run(room.id)
      return { code: room.code }
    })
  }

  function claimHost(code, userId) {
    if (!userId) {
      throw new AppError(401, '로그인이 필요합니다.', 'AUTH_REQUIRED')
    }

    return transaction(db, () => {
      const room = getRoomRecord(code)
      if (!hasOwnerAccess(room, userId)) {
        throw new AppError(
          403,
          '방 소유자만 재생 기기를 변경할 수 있습니다.',
          'OWNER_FORBIDDEN',
        )
      }
      if (room.playback_mode !== 'host_only') {
        throw new AppError(
          409,
          '호스트 기기는 한 스피커로 함께 모드에서만 지정할 수 있습니다.',
          'HOST_ONLY_REQUIRED',
        )
      }

      const hostToken = createToken()
      db.prepare('UPDATE rooms SET host_token_hash = ? WHERE id = ?').run(
        hashToken(hostToken),
        room.id,
      )
      return {
        hostToken,
        room: getPublicRoom(code),
      }
    })
  }

  function issueAccountParticipantToken(participant) {
    const participantToken = createToken()
    db.prepare(
      'INSERT INTO participant_access_tokens (participant_id, token_hash, created_at) VALUES (?, ?, ?)',
    ).run(participant.id, hashToken(participantToken), now())
    db.prepare(
      `DELETE FROM participant_access_tokens
       WHERE participant_id = ? AND rowid NOT IN (
         SELECT rowid FROM participant_access_tokens
         WHERE participant_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 16
       )`,
    ).run(participant.id, participant.id)
    return {
      participantToken,
      participant: {
        id: participant.id,
        nickname: participant.nickname,
        avatarUrl: participant.avatar_url ?? null,
        isManager: Boolean(participant.user_id && participant.is_manager),
        isMember: true,
      },
    }
  }

  function resumeAccountParticipant(code, userId) {
    if (!userId) throw new AppError(401, '로그인이 필요합니다.', 'AUTH_REQUIRED')
    return transaction(db, () => {
      const room = getRoomRecord(code)
      const participant = findAccountParticipant.get(room.id, String(userId))
      if (!participant) {
        throw new AppError(404, '참여한 방이 아닙니다.', 'MEMBERSHIP_NOT_FOUND')
      }
      return { ...issueAccountParticipantToken(participant), room: getPublicRoom(code) }
    })
  }

  function leaveAccountRoom(code, userId) {
    if (!userId) throw new AppError(401, '로그인이 필요합니다.', 'AUTH_REQUIRED')
    return transaction(db, () => {
      const room = getRoomRecord(code)
      if (hasOwnerAccess(room, userId)) {
        throw new AppError(409, '방 소유자는 방을 나갈 수 없습니다.', 'OWNER_CANNOT_LEAVE')
      }
      const participant = findAccountParticipant.get(room.id, String(userId))
      if (!participant) {
        throw new AppError(404, '참여한 방이 아닙니다.', 'MEMBERSHIP_NOT_FOUND')
      }
      db.prepare(
        'UPDATE participants SET left_at = ?, is_manager = 0 WHERE id = ?',
      ).run(now(), participant.id)
      db.prepare('DELETE FROM participant_access_tokens WHERE participant_id = ?')
        .run(participant.id)
      return { participantId: participant.id, room: getPublicRoom(code) }
    })
  }

  function joinRoom(code, { nickname, userId = null, avatarUrl = null, participantToken = null }) {
    const normalizedNickname = normalizeNickname(nickname)

    return transaction(db, () => {
      const room = getRoomRecord(code)
      if (!userId && !room.allow_guests) {
        throw new AppError(403, '이 방은 로그인 후 참여할 수 있습니다.', 'GUEST_JOIN_DISABLED')
      }
      let joined
      if (userId) {
        let participant = findAccountParticipant.get(room.id, String(userId))
        if (!participant && participantToken) {
          const guest = participantForCredentials(room, participantToken, null)
          if (guest && !guest.user_id) {
            db.prepare(
              `UPDATE participants SET user_id = ?, profile_source = 'account',
               nickname = ?, avatar_url = ?, is_manager = 0 WHERE id = ?`,
            ).run(String(userId), normalizedNickname, avatarUrl, guest.id)
            participant = findAccountParticipant.get(room.id, String(userId))
          }
        }
        joined = participant
          ? issueAccountParticipantToken(participant)
          : insertParticipant(room, {
              nickname: normalizedNickname,
              userId,
              profileSource: 'account',
              avatarUrl,
            })
      } else {
        joined = insertParticipant(room, { nickname: normalizedNickname })
      }

      const state = getPublicRoom(code)
      return {
        ...joined,
        room: state,
      }
    })
  }

  function getParticipantStatus(code, participantToken, userId) {
    const room = getRoomRecord(code)
    const participant = requireParticipant(room, participantToken, userId)
    return {
      id: participant.id,
      nickname: participant.nickname,
      avatarUrl: participant.avatar_url ?? null,
      isManager: Boolean(participant.user_id && participant.is_manager),
      isMember: Boolean(participant.user_id),
    }
  }

  function assertCanAddSong(code, participantToken, userId) {
    const room = getRoomRecord(code)
    requireParticipant(room, participantToken, userId)
  }

  function getRoomSession(code, credentials = {}) {
    const room = getRoomRecord(code)
    const { isHost, isOwner, participant } = getSessionIdentity(room, credentials)
    if (!isHost && !isOwner && !participant) {
      throw new AppError(
        401,
        '이 방의 저장된 세션이 유효하지 않습니다.',
        'ROOM_SESSION_INVALID',
      )
    }
    return {
      isHost,
      isOwner,
      participant: participant
        ? {
            id: participant.id,
            nickname: participant.nickname,
            avatarUrl: participant.avatar_url ?? null,
            isManager: Boolean(participant.user_id && participant.is_manager),
            isMember: Boolean(participant.user_id),
          }
        : null,
      room: getPublicRoom(code),
    }
  }

  function addSong(code, participantToken, song, userId) {
    return transaction(db, () => {
      const room = getRoomRecord(code)
      const participant = requireParticipant(room, participantToken, userId)

      const duplicate = db
        .prepare(
          `SELECT 1 FROM songs
           WHERE room_id = ? AND video_id = ? AND status IN ('queued', 'current')`,
        )
        .get(room.id, song.videoId)
      if (duplicate) {
        throw new AppError(409, '이미 재생 중이거나 대기열에 있는 곡입니다.', 'DUPLICATE_SONG')
      }

      const nextPosition = Number(
        db
          .prepare(
            `SELECT COALESCE(MAX(position), 0) + 1 AS position
             FROM songs WHERE room_id = ? AND status = 'queued'`,
          )
          .get(room.id).position,
      )
      const id = crypto.randomUUID()
      const createdAt = now()
      const status = room.current_song_id ? 'queued' : 'current'
      db.prepare(
        `INSERT INTO songs (
          id, room_id, video_id, title, artist, duration_seconds, thumbnail_url,
          added_by, status, position, started_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        room.id,
        song.videoId,
        song.title,
        song.artist,
        song.durationSeconds,
        song.thumbnailUrl,
        participant.id,
        status,
        status === 'current' ? 0 : nextPosition,
        status === 'current' ? createdAt : null,
        createdAt,
      )
      if (status === 'current') {
        db.prepare(
          `UPDATE rooms
           SET current_song_id = ?, playback_paused = 0, playback_blocked = 0,
               playback_position_seconds = 0, playback_anchor_at = ?,
               playback_pending = ?,
               playback_revision = playback_revision + 1
           WHERE id = ?`,
        ).run(
          id,
          createdAt,
          room.playback_mode === 'all_devices' ? 1 : 0,
          room.id,
        )
      }
      return getPublicRoom(code)
    })
  }

  function advanceRoom(room, code, changedAt = now()) {
    let next = db
      .prepare(
        `SELECT id FROM songs
         WHERE room_id = ? AND status = 'queued'
         ORDER BY position ASC, created_at ASC LIMIT 1`,
      )
      .get(room.id)
    const suggestion = next ? null : getAutoplaySuggestions(room)[0]
    if (room.current_song_id) {
      db.prepare("UPDATE songs SET status = 'played' WHERE id = ? AND status = 'current'").run(
        room.current_song_id,
      )
    }
    if (next) {
      db.prepare("UPDATE songs SET status = 'current', started_at = ? WHERE id = ?")
        .run(changedAt, next.id)
    } else if (suggestion) {
      const id = crypto.randomUUID()
      db.prepare(
        `INSERT INTO songs (
          id, room_id, video_id, title, artist, duration_seconds, thumbnail_url,
          added_by, status, position, is_autoplay, started_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'current', 0, 1, ?, ?)`,
      ).run(id, room.id, suggestion.videoId, suggestion.title, suggestion.artist,
        suggestion.durationSeconds, suggestion.thumbnailUrl,
        ensureAutoplayParticipant(room, changedAt), changedAt, changedAt)
      db.prepare('DELETE FROM room_autoplay_suggestions WHERE id = ?').run(suggestion.id)
      next = { id }
    }
    db.prepare(
      `UPDATE rooms
       SET current_song_id = ?, playback_paused = 0, playback_blocked = 0,
           playback_position_seconds = 0, playback_anchor_at = ?,
           playback_pending = ?,
           playback_revision = playback_revision + 1
       WHERE id = ?`,
    ).run(
      next?.id ?? null,
      changedAt,
      next && room.playback_mode === 'all_devices' ? 1 : 0,
      room.id,
    )
    return getPublicRoom(code)
  }

  function advance(code, credentials, options = {}) {
    const reason = options?.reason ?? 'skip'
    if (!['skip', 'ended'].includes(reason)) {
      throw new AppError(400, '곡 변경 사유가 올바르지 않습니다.', 'INVALID_ADVANCE_REASON')
    }
    return transaction(db, () => {
      const room = getRoomRecord(code)
      if (reason === 'ended' && (room.playback_mode !== 'host_only' || !hasHostAccess(room, credentials?.hostToken))) {
        throw new AppError(403, '곡 재생 완료는 호스트 기기에서만 보고할 수 있습니다.', 'HOST_FORBIDDEN')
      }
      if (!room.current_song_id) {
        throw new AppError(
          409,
          '현재 재생 중인 곡이 없습니다.',
          'NO_CURRENT_SONG',
        )
      }
      const currentSong = db
        .prepare(
          `SELECT added_by FROM songs
           WHERE id = ? AND room_id = ? AND status = 'current'`,
        )
        .get(room.current_song_id, room.id)
      if (!currentSong) {
        throw new AppError(
          409,
          '현재 재생 중인 곡이 없습니다.',
          'NO_CURRENT_SONG',
        )
      }
      requireSongControl(room, credentials, currentSong.added_by)
      if ((reason === 'ended' || options?.songId !== undefined) && options?.songId !== room.current_song_id) {
        throw new AppError(409, '현재 재생 중인 곡이 변경되었습니다.', 'CURRENT_SONG_MISMATCH')
      }
      const changedAt = now()
      if (reason === 'skip' && getPlaybackPosition(room, changedAt) < EARLY_SKIP_THRESHOLD_SECONDS) {
        db.prepare('UPDATE songs SET play_count_excluded = 1 WHERE id = ?').run(room.current_song_id)
      }
      return advanceRoom(room, code, changedAt)
    })
  }

  function advanceCompletedAllDeviceRooms(isRoomActive = () => true) {
    const checkedAt = now()
    const advancedRooms = []

    for (const candidate of findAllDevicesPlaybackRooms.all()) {
      const advanced = transaction(db, () => {
        const room = getRoomRecord(candidate.code)
        if (
          room.playback_mode !== 'all_devices' ||
          room.playback_paused ||
          room.playback_pending ||
          !room.current_song_id
        ) {
          return null
        }

        const currentSong = db
          .prepare('SELECT duration_seconds FROM songs WHERE id = ?')
          .get(room.current_song_id)
        if (!currentSong) return null

        const position = getPlaybackPosition(room, checkedAt)
        if (position >= Number(currentSong.duration_seconds)) {
          return advanceRoom(room, candidate.code, checkedAt)
        }

        if (!isRoomActive(candidate.code)) {
          db.prepare(
            `UPDATE rooms
             SET playback_pending = 1, playback_position_seconds = ?,
                 playback_anchor_at = ?, playback_revision = playback_revision + 1
             WHERE id = ?`,
          ).run(position, checkedAt, room.id)
          return getPublicRoom(candidate.code)
        }

        return null
      })
      if (advanced) advancedRooms.push(advanced)
    }

    return advancedRooms
  }

  function previewUserRecordsAsAdmin(code, participantId) {
    return transaction(db, () => readRoomUserRecords(db, code, participantId).preview)
  }

  function deleteUserRecordsAsAdmin(code, participantId, confirmation, onDelete) {
    return transaction(db, () => {
      const records = readRoomUserRecords(db, code, participantId)
      if (confirmation?.confirmationCode !== records.room.code) {
        throw new AppError(400, '확인을 위해 방 코드를 정확히 입력해주세요.', 'ROOM_RECORDS_CONFIRMATION_MISMATCH')
      }
      if (confirmation?.revision !== records.preview.revision) {
        throw new AppError(409, '삭제 대상 기록이 변경되었습니다. 삭제 범위를 다시 확인해주세요.', 'ROOM_RECORDS_CHANGED')
      }
      const currentSongRemoved = Boolean(records.room.current_song_id && db.prepare(
        `SELECT 1 FROM songs WHERE id = ? AND added_by IN (${records.participantQuery})`,
      ).get(records.room.current_song_id, records.room.id, records.identity))
      deleteRoomUserRecords(db, records)
      if (currentSongRemoved) advanceRoom(records.room, records.room.code)
      else db.prepare('UPDATE rooms SET playback_revision = playback_revision + 1 WHERE id = ?').run(records.room.id)
      onDelete?.(records.preview)
      return {
        ...records.preview,
        participantIds: records.participants.map(({ id }) => id),
        room: getPublicRoom(records.room.code),
      }
    })
  }

  function previewVideoRecordsAsAdmin(code, videoId) {
    return transaction(db, () => readRoomVideoRecords(db, code, videoId).preview)
  }

  function deleteVideoRecordsAsAdmin(code, videoId, confirmation, onDelete) {
    return transaction(db, () => {
      const records = readRoomVideoRecords(db, code, videoId)
      if (confirmation?.confirmationCode !== records.room.code) {
        throw new AppError(400, '확인을 위해 방 코드를 정확히 입력해주세요.', 'ROOM_RECORDS_CONFIRMATION_MISMATCH')
      }
      if (confirmation?.revision !== records.preview.revision) {
        throw new AppError(409, '삭제 대상 기록이 변경되었습니다. 삭제 범위를 다시 확인해주세요.', 'ROOM_RECORDS_CHANGED')
      }
      const currentRemoved = records.preview.counts.currentSongs > 0
      deleteRoomVideoRecords(db, records)
      if (currentRemoved) advanceRoom(records.room, records.room.code)
      else db.prepare('UPDATE rooms SET playback_revision = playback_revision + 1 WHERE id = ?').run(records.room.id)
      onDelete?.(records.preview)
      return { ...records.preview, room: getPublicRoom(records.room.code) }
    })
  }

  function reportPlaybackFailure(code, credentials, { songId, videoId, errorCode } = {}) {
    if (typeof songId !== 'string' || !songId || typeof videoId !== 'string' || !videoId ||
      ![100, 101, 150].includes(errorCode)) {
      throw new AppError(400, '재생 오류 보고가 올바르지 않습니다.', 'INVALID_PLAYBACK_STATE')
    }
    return transaction(db, () => {
      const room = getRoomRecord(code)
      const identity = getSessionIdentity(room, credentials)
      if (room.playback_mode === 'host_only') {
        if (!identity.isHost) {
          throw new AppError(403, '호스트 권한이 없습니다.', 'HOST_FORBIDDEN')
        }
      } else if (!identity.isOwner && !identity.participant) {
        throw new AppError(401, '이 방에 다시 참여해주세요.', 'PARTICIPANT_REQUIRED')
      }
      // Duplicate reports and delayed reports for a previous occurrence must not skip another song.
      if (room.current_song_id !== songId) return getPublicRoom(code)
      const currentSong = db.prepare(
        "SELECT video_id FROM songs WHERE id = ? AND room_id = ? AND status = 'current'",
      ).get(songId, room.id)
      if (!currentSong || currentSong.video_id !== videoId) return getPublicRoom(code)
      db.prepare(
        "UPDATE songs SET status = 'removed', started_at = NULL, playback_error_code = ? WHERE id = ?",
      ).run(errorCode, songId)
      return advanceRoom(room, code)
    })
  }

  function changePlaybackPaused(code, paused, { authorize, onChange, skipUnchanged = false }) {
    if (typeof paused !== 'boolean') {
      throw new AppError(
        400,
        '재생 상태가 올바르지 않습니다.',
        'INVALID_PLAYBACK_STATE',
      )
    }

    return transaction(db, () => {
      const room = getRoomRecord(code)
      authorize(room)
      if (!room.current_song_id) {
        throw new AppError(
          409,
          '현재 재생 중인 곡이 없습니다.',
          'NO_CURRENT_SONG',
        )
      }
      if (skipUnchanged && Boolean(room.playback_paused) === paused) return getPublicRoom(code)
      const changedAt = now()
      const position = getPlaybackPosition(room, changedAt)
      db.prepare(
        `UPDATE rooms
         SET playback_paused = ?, playback_blocked = 0,
             playback_position_seconds = ?, playback_anchor_at = ?,
             playback_revision = playback_revision + 1
         WHERE id = ?`,
      ).run(paused ? 1 : 0, position, changedAt, room.id)
      if (Boolean(room.playback_paused) !== paused) onChange?.(paused)
      return getPublicRoom(code)
    })
  }

  function setPlaybackPaused(code, credentials, paused) {
    return changePlaybackPaused(code, paused, {
      authorize: (room) => requireController(room, credentials),
    })
  }

  function setPlaybackPausedAsAdmin(code, paused, onChange) {
    return changePlaybackPaused(code, paused, {
      authorize: () => {}, onChange, skipUnchanged: true,
    })
  }

  function reportPlaybackBlocked(code, hostToken, blocked) {
    if (typeof blocked !== 'boolean') {
      throw new AppError(
        400,
        '자동재생 차단 상태가 올바르지 않습니다.',
        'INVALID_PLAYBACK_BLOCKED_STATE',
      )
    }

    return transaction(db, () => {
      const room = getRoomRecord(code)
      if (room.playback_mode !== 'host_only') {
        throw new AppError(
          409,
          '호스트 기기는 한 스피커로 함께 모드에서만 지정할 수 있습니다.',
          'HOST_ONLY_REQUIRED',
        )
      }
      if (!hasHostAccess(room, hostToken)) {
        throw new AppError(403, '호스트 권한이 없습니다.', 'HOST_FORBIDDEN')
      }
      const changedAt = now()
      if (!room.current_song_id) {
        db.prepare(
          `UPDATE rooms
           SET playback_paused = 0, playback_blocked = 0,
               playback_position_seconds = 0, playback_anchor_at = ?,
               playback_revision = playback_revision + 1
           WHERE id = ?`,
        ).run(changedAt, room.id)
        return getPublicRoom(code)
      }
      const position = getPlaybackPosition(room, changedAt)
      db.prepare(
        `UPDATE rooms
         SET playback_paused = ?, playback_blocked = ?,
             playback_position_seconds = ?, playback_anchor_at = ?,
             playback_revision = playback_revision + 1
         WHERE id = ?`,
      ).run(
        blocked ? 1 : 0,
        blocked ? 1 : 0,
        position,
        changedAt,
        room.id,
      )
      return getPublicRoom(code)
    })
  }

  function removeSong(code, credentials, songId) {
    return transaction(db, () => {
      const room = getRoomRecord(code)
      const song = db
        .prepare(
          `SELECT id, added_by FROM songs
           WHERE id = ? AND room_id = ? AND status = 'queued'`,
        )
        .get(songId, room.id)
      if (!song) {
        throw new AppError(404, '삭제할 대기 곡을 찾지 못했습니다.', 'SONG_NOT_FOUND')
      }
      requireSongControl(room, credentials, song.added_by)
      const result = db
        .prepare(
          `UPDATE songs SET status = 'removed'
           WHERE id = ? AND room_id = ? AND status = 'queued'`,
        )
        .run(songId, room.id)
      if (result.changes !== 1) {
        throw new AppError(404, '삭제할 대기 곡을 찾지 못했습니다.', 'SONG_NOT_FOUND')
      }
      return getPublicRoom(code)
    })
  }

  function reorderSong(code, credentials, songId, targetIndex) {
    const normalizedTargetIndex = Number(targetIndex)
    if (!Number.isInteger(normalizedTargetIndex) || normalizedTargetIndex < 0) {
      throw new AppError(
        400,
        '이동할 대기열 위치가 올바르지 않습니다.',
        'INVALID_QUEUE_POSITION',
      )
    }
    return transaction(db, () => {
      const room = getRoomRecord(code)
      requireController(room, credentials)
      const queuedSongs = db
        .prepare(
          `SELECT id FROM songs
           WHERE room_id = ? AND status = 'queued'
           ORDER BY position ASC, created_at ASC`,
        )
        .all(room.id)
      const sourceIndex = queuedSongs.findIndex((song) => song.id === songId)
      if (sourceIndex < 0) {
        throw new AppError(404, '대기 곡을 찾지 못했습니다.', 'SONG_NOT_FOUND')
      }
      if (normalizedTargetIndex >= queuedSongs.length) {
        throw new AppError(
          400,
          '이동할 대기열 위치가 올바르지 않습니다.',
          'INVALID_QUEUE_POSITION',
        )
      }
      if (sourceIndex === normalizedTargetIndex) return getPublicRoom(code)

      const [movedSong] = queuedSongs.splice(sourceIndex, 1)
      queuedSongs.splice(normalizedTargetIndex, 0, movedSong)
      const updatePosition = db.prepare(
        'UPDATE songs SET position = ? WHERE id = ? AND room_id = ?',
      )
      queuedSongs.forEach((song, index) => {
        updatePosition.run(index + 1, song.id, room.id)
      })
      return getPublicRoom(code)
    })
  }

  function startPlayback(code, credentials, videoId, positionSeconds) {
    const position = Number(positionSeconds)
    if (!Number.isFinite(position) || position < 0) {
      throw new AppError(
        400,
        '재생 위치가 올바르지 않습니다.',
        'INVALID_PLAYBACK_POSITION',
      )
    }

    return transaction(db, () => {
      const room = getRoomRecord(code)
      const identity = getSessionIdentity(room, credentials)
      if (!identity.isHost && !identity.isOwner && !identity.participant) {
        throw new AppError(
          401,
          '이 방에 다시 참여해주세요.',
          'PARTICIPANT_REQUIRED',
        )
      }
      if (!room.current_song_id) {
        throw new AppError(
          409,
          '현재 재생 중인 곡이 없습니다.',
          'NO_CURRENT_SONG',
        )
      }
      if (room.playback_mode !== 'all_devices' || !room.playback_pending) {
        return getPublicRoom(code)
      }

      const currentSong = db
        .prepare('SELECT video_id, duration_seconds FROM songs WHERE id = ?')
        .get(room.current_song_id)
      if (!currentSong || currentSong.video_id !== String(videoId ?? '')) {
        throw new AppError(
          409,
          '현재 재생 중인 곡이 변경되었습니다.',
          'CURRENT_SONG_MISMATCH',
        )
      }

      const changedAt = now()
      const boundedPosition = Math.min(
        Math.max(position, Number(room.playback_position_seconds)),
        Number(currentSong.duration_seconds),
      )
      db.prepare(
        `UPDATE rooms
         SET playback_pending = 0, playback_paused = 0, playback_blocked = 0,
             playback_position_seconds = ?, playback_anchor_at = ?,
             playback_revision = playback_revision + 1
         WHERE id = ? AND playback_pending = 1`,
      ).run(boundedPosition, changedAt, room.id)
      return getPublicRoom(code)
    })
  }

  function updateRoomSettings(code, credentials, settings = {}) {
    const hasVolume = settings.hostVolume !== undefined
    const hasTitle = settings.title !== undefined
    const hasAllowGuests = settings.allowGuests !== undefined
    const hasHistoryAutoplay = settings.historyAutoplay !== undefined
    const hasAutoplayFilters = settings.autoplayFilters !== undefined
    if (!hasVolume && !hasTitle && !hasAllowGuests && !hasHistoryAutoplay && !hasAutoplayFilters) {
      throw new AppError(400, '변경할 설정이 없습니다.', 'EMPTY_SETTINGS')
    }

    return transaction(db, () => {
      const room = getRoomRecord(code)
      if (hasTitle || hasAllowGuests || hasHistoryAutoplay || hasAutoplayFilters) {
        if (!hasOwnerAccess(room, credentials?.userId)) {
          throw new AppError(403, '방 소유자만 이 설정을 변경할 수 있습니다.', 'OWNER_FORBIDDEN')
        }
      } else {
        requireController(room, credentials)
      }

      if (hasTitle) {
        const title = normalizeRoomTitle(settings.title) || room.code
        db.prepare('UPDATE rooms SET title = ? WHERE id = ?').run(title, room.id)
      }
      if (hasAllowGuests) {
        if (typeof settings.allowGuests !== 'boolean') {
          throw new AppError(400, '비로그인 참여 설정이 올바르지 않습니다.', 'INVALID_ALLOW_GUESTS')
        }
        db.prepare('UPDATE rooms SET allow_guests = ? WHERE id = ?').run(
          settings.allowGuests ? 1 : 0, room.id,
        )
      }
      if (hasHistoryAutoplay) {
        if (typeof settings.historyAutoplay !== 'boolean') {
          throw new AppError(400, '자동 재생 설정이 올바르지 않습니다.', 'INVALID_HISTORY_AUTOPLAY')
        }
        if (settings.historyAutoplay && getAutoplayHistoryCount(room.id) < AUTOPLAY_MIN_HISTORY) {
          throw new AppError(409, '자동 재생에는 이전 재생 기록이 10건 이상 필요합니다.', 'AUTOPLAY_HISTORY_REQUIRED')
        }
        db.prepare('UPDATE rooms SET history_autoplay = ? WHERE id = ?')
          .run(settings.historyAutoplay ? 1 : 0, room.id)
        if (!settings.historyAutoplay) {
          db.prepare('DELETE FROM room_autoplay_suggestions WHERE room_id = ?').run(room.id)
        }
      }

      if (hasAutoplayFilters) {
        const filters = settings.autoplayFilters
        if (!filters || typeof filters !== 'object' || Array.isArray(filters) ||
          !Array.isArray(filters.excludedWords) || !Array.isArray(filters.excludedVideoIds) ||
          filters.excludedWords.length > 50 || filters.excludedVideoIds.length > 100 ||
          filters.excludedWords.some((word) => typeof word !== 'string' || !word.trim() || word.trim().length > 80) ||
          filters.excludedVideoIds.some((video) => typeof video !== 'string' || !extractYouTubeVideoId(video))) {
          throw new AppError(400, '자동 재생 필터가 올바르지 않습니다.', 'INVALID_AUTOPLAY_FILTERS')
        }
        const minDurationSeconds = filters.minDurationSeconds === undefined
          ? room.autoplay_min_duration_seconds : filters.minDurationSeconds
        const maxDurationSeconds = filters.maxDurationSeconds === undefined
          ? room.autoplay_max_duration_seconds : filters.maxDurationSeconds
        if (!Number.isInteger(minDurationSeconds) || !Number.isInteger(maxDurationSeconds) ||
          minDurationSeconds < 0 || maxDurationSeconds < 1 ||
          minDurationSeconds > maxDurationSeconds || maxDurationSeconds > AUTOPLAY_DURATION_LIMIT_SECONDS) {
          throw new AppError(400, '자동 재생 영상 길이 범위가 올바르지 않습니다.', 'INVALID_AUTOPLAY_DURATION')
        }
        const words = [...new Map(filters.excludedWords.map((word) => [
          word.trim().normalize('NFKC').toLocaleLowerCase(), word.trim(),
        ])).values()]
        const videoIds = [...new Set(filters.excludedVideoIds.map(extractYouTubeVideoId))]
        const wordsJson = JSON.stringify(words)
        const videoIdsJson = JSON.stringify(videoIds)
        if (wordsJson !== room.autoplay_excluded_words || videoIdsJson !== room.autoplay_excluded_video_ids ||
          minDurationSeconds !== room.autoplay_min_duration_seconds ||
          maxDurationSeconds !== room.autoplay_max_duration_seconds) {
          db.prepare(`UPDATE rooms SET autoplay_excluded_words = ?, autoplay_excluded_video_ids = ?,
            autoplay_min_duration_seconds = ?, autoplay_max_duration_seconds = ? WHERE id = ?`)
            .run(wordsJson, videoIdsJson, minDurationSeconds, maxDurationSeconds, room.id)
          db.prepare('DELETE FROM room_autoplay_suggestions WHERE room_id = ?').run(room.id)
        }
      }

      if (hasVolume) {
        const volume = Number(settings.hostVolume)
        if (!Number.isInteger(volume) || volume < 0 || volume > 100) {
          throw new AppError(
            400,
            '호스트 볼륨은 0~100 사이여야 합니다.',
            'INVALID_HOST_VOLUME',
          )
        }
        db.prepare('UPDATE rooms SET host_volume = ? WHERE id = ?').run(
          volume,
          room.id,
        )
      }

      const updatedRoom = getRoomRecord(code)
      if ((hasHistoryAutoplay || hasAutoplayFilters) && updatedRoom.history_autoplay && !updatedRoom.current_song_id) {
        return advanceRoom(updatedRoom, code)
      }
      return getPublicRoom(code)
    })
  }

  function refreshAutoplaySuggestions(code, credentials) {
    return transaction(db, () => {
      const room = getRoomRecord(code)
      requireController(room, credentials)
      if (!room.history_autoplay) {
        throw new AppError(409, '자동 재생이 꺼져 있습니다.', 'HISTORY_AUTOPLAY_DISABLED')
      }
      const firstVideoId = getAutoplaySuggestions(room)[0]?.videoId ?? null
      db.prepare('DELETE FROM room_autoplay_suggestions WHERE room_id = ?').run(room.id)
      getAutoplaySuggestions(room, firstVideoId)
      return getPublicRoom(code)
    })
  }

  function setManager(code, credentials, targetParticipantId, isManager) {
    if (typeof isManager !== 'boolean') {
      throw new AppError(
        400,
        '관리자 상태가 올바르지 않습니다.',
        'INVALID_MANAGER_STATE',
      )
    }

    return transaction(db, () => {
      const room = getRoomRecord(code)
      const normalizedCredentials =
        typeof credentials === 'string'
          ? { participantToken: credentials }
          : credentials ?? {}
      requireController(room, normalizedCredentials)
      const target = db
        .prepare(
          'SELECT id, user_id, is_manager FROM participants WHERE id = ? AND room_id = ? AND left_at IS NULL',
        )
        .get(String(targetParticipantId ?? ''), room.id)
      if (!target) {
        throw new AppError(
          404,
          '참여자를 찾지 못했습니다.',
          'PARTICIPANT_NOT_FOUND',
        )
      }
      if (target.user_id && target.user_id === room.owner_user_id) {
        throw new AppError(409, '방 호스트의 관리자 권한은 변경할 수 없습니다.', 'OWNER_MODERATION_FORBIDDEN')
      }
      if (isManager && !target.user_id) {
        throw new AppError(409, '로그인한 참여자만 관리자로 지정할 수 있습니다.', 'MANAGER_ACCOUNT_REQUIRED')
      }
      if (Boolean(target.is_manager) === isManager) {
        return getPublicRoom(code)
      }

      db.prepare(
        'UPDATE participants SET is_manager = ? WHERE id = ? AND room_id = ?',
      ).run(isManager ? 1 : 0, target.id, room.id)
      return getPublicRoom(code)
    })
  }

  function requireOwnerModerationTarget(room, ownerUserId, targetParticipantId) {
    if (!hasOwnerAccess(room, ownerUserId)) {
      throw new AppError(403, '방 호스트만 참여자를 관리할 수 있습니다.', 'OWNER_FORBIDDEN')
    }
    const target = db.prepare(
      'SELECT * FROM participants WHERE id = ? AND room_id = ? AND left_at IS NULL',
    ).get(String(targetParticipantId ?? ''), room.id)
    if (!target) {
      throw new AppError(404, '참여자를 찾지 못했습니다.', 'PARTICIPANT_NOT_FOUND')
    }
    if (target.user_id && target.user_id === room.owner_user_id) {
      throw new AppError(409, '방 호스트의 연결은 끊을 수 없습니다.', 'OWNER_MODERATION_FORBIDDEN')
    }
    return target
  }

  function disconnectParticipant(code, ownerUserId, targetParticipantId, online = true) {
    return transaction(db, () => {
      const room = getRoomRecord(code)
      const target = requireOwnerModerationTarget(room, ownerUserId, targetParticipantId)
      if (!online) {
        throw new AppError(409, '현재 연결된 참여자가 아닙니다.', 'PARTICIPANT_OFFLINE')
      }
      db.prepare('UPDATE participants SET offline_since = ? WHERE id = ?').run(now(), target.id)
      return { participantId: target.id, room: getPublicRoom(code) }
    })
  }

  function markAllParticipantsOffline() {
    transaction(db, () => {
      db.prepare(
        'UPDATE participants SET offline_since = ? WHERE left_at IS NULL',
      ).run(now())
      // After a restart no browser is playing. Keep the last stored position
      // until a participant actually starts the video again.
      db.prepare(
        `UPDATE rooms
         SET playback_pending = 1, playback_anchor_at = ?,
             playback_revision = playback_revision + 1
         WHERE playback_mode = 'all_devices' AND current_song_id IS NOT NULL
           AND playback_paused = 0 AND playback_pending = 0`,
      ).run(now())
    })
  }

  function markParticipantOnline(code, participantId) {
    const room = getRoomRecord(code)
    db.prepare(
      'UPDATE participants SET offline_since = NULL WHERE id = ? AND room_id = ? AND left_at IS NULL',
    ).run(participantId, room.id)
  }

  function markParticipantOffline(code, participantId, offlineSince) {
    const room = getRoomRecord(code)
    db.prepare(
      'UPDATE participants SET offline_since = ? WHERE id = ? AND room_id = ? AND left_at IS NULL',
    ).run(offlineSince, participantId, room.id)
  }

  return {
    createRoom,
    joinRoom,
    resumeAccountParticipant,
    leaveAccountRoom,
    getPublicRoom,
    getRoomStats,
    getRoomHistory,
    listAutoplayHistoryVideos,
    getSongVote,
    setSongVote,
    getParticipantStatus,
    assertCanAddSong,
    getRoomSession,
    listOwnedRooms,
    listJoinedRooms,
    deleteOwnedRoom,
    claimHost,
    listChatMessages,
    addChatMessage,
    addRoomEvent,
    hasActiveSession,
    getPresenceIdentity,
    addSong,
    advance,
    advanceCompletedAllDeviceRooms,
    setPlaybackPaused,
    setPlaybackPausedAsAdmin,
    startPlayback,
    reportPlaybackFailure,
    previewUserRecordsAsAdmin,
    deleteUserRecordsAsAdmin,
    previewVideoRecordsAsAdmin,
    deleteVideoRecordsAsAdmin,
    reportPlaybackBlocked,
    removeSong,
    reorderSong,
    updateRoomSettings,
    refreshAutoplaySuggestions,
    setManager,
    disconnectParticipant,
    markAllParticipantsOffline,
    markParticipantOnline,
    markParticipantOffline,
  }
}

module.exports = { createRoomService, generateCode, hashToken, normalizeCode }
