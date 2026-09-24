const crypto = require('node:crypto')
const { transaction } = require('./db')
const { AppError } = require('./errors')

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const PLAYBACK_MODES = new Set(['host_only', 'all_devices'])
const RETENTION_MODES = new Set(['temporary', 'permanent'])
const PROFILE_SOURCES = new Set(['account', 'custom'])
const CHAT_MESSAGE_MAX_LENGTH = 300
const CHAT_HISTORY_LIMIT = 100
const ROOM_EVENT_TYPES = new Set([
  'song_added',
  'song_skipped',
  'song_removed',
  'queue_reordered',
  'playback_paused',
  'playback_resumed',
  'participant_joined',
  'participant_left',
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
  const roomTtlMs = (options.roomTtlHours ?? 24) * 60 * 60 * 1000
  const emptyRoomTtlMs =
    (options.emptyRoomTtlHours ?? 1) * 60 * 60 * 1000
  const now = options.now ?? Date.now

  const findRoom = db.prepare(
    `SELECT * FROM rooms
     WHERE code = ?
       AND (retention_mode <> 'legacy' OR expires_at > ?)`,
  )
  const findParticipant = db.prepare(
    'SELECT * FROM participants WHERE room_id = ? AND token_hash = ?',
  )
  const findAllDevicesPlaybackRooms = db.prepare(
    `SELECT rooms.code
     FROM rooms
     WHERE (rooms.retention_mode <> 'legacy' OR rooms.expires_at > ?)
       AND rooms.playback_mode = 'all_devices'
       AND rooms.playback_paused = 0
       AND rooms.playback_pending = 0
       AND rooms.current_song_id IS NOT NULL`,
  )

  function getRoomRecord(code) {
    const room = findRoom.get(normalizeCode(code), now())
    if (!room) throw new AppError(404, '존재하지 않거나 만료된 방입니다.', 'ROOM_NOT_FOUND')
    return room
  }

  function hasHostAccess(room, token) {
    if (!token) return false
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

  function requireParticipant(room, token) {
    const participant = findParticipant.get(room.id, hashToken(token))
    if (!participant) {
      throw new AppError(401, '이 방에 다시 참여해주세요.', 'PARTICIPANT_REQUIRED')
    }
    return participant
  }

  function requireManager(room, token) {
    const participant = requireParticipant(room, token)
    if (!participant.is_manager) {
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
    if (normalizedCredentials.participantToken) {
      requireManager(room, normalizedCredentials.participantToken)
      return
    }
    if (normalizedCredentials.hostToken) {
      throw new AppError(403, '호스트 권한이 없습니다.', 'HOST_FORBIDDEN')
    }
    throw new AppError(403, '관리 권한이 없습니다.', 'CONTROL_FORBIDDEN')
  }

  function requireSongControl(room, credentials, addedByParticipantId) {
    const normalizedCredentials =
      typeof credentials === 'string'
        ? { hostToken: credentials }
        : credentials ?? {}
    if (hasHostAccess(room, normalizedCredentials.hostToken)) return
    if (hasOwnerAccess(room, normalizedCredentials.userId)) return
    if (normalizedCredentials.participantToken) {
      const participant = requireParticipant(
        room,
        normalizedCredentials.participantToken,
      )
      if (
        participant.is_manager ||
        participant.id === addedByParticipantId
      ) {
        return
      }
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
    const participant = normalizedCredentials.participantToken
      ? findParticipant.get(
          room.id,
          hashToken(normalizedCredentials.participantToken),
        )
      : null
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
      position: row.position,
    }
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

  function listChatMessages(code, participantToken) {
    const room = getRoomRecord(code)
    requireParticipant(room, participantToken)
    return db
      .prepare(
        `SELECT * FROM (
           SELECT *
           FROM room_feed_entries
           WHERE room_id = ?
           ORDER BY sequence DESC
           LIMIT ?
         )
         ORDER BY sequence ASC`,
      )
      .all(room.id, CHAT_HISTORY_LIMIT)
      .map(serializeFeedEntry)
  }

  function addChatMessage(code, participantToken, content) {
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
      const participant = requireParticipant(room, participantToken)
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

      if (actor.participantToken) {
        participant = requireParticipant(room, actor.participantToken)
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
            `SELECT songs.*, participants.nickname
             FROM songs
             JOIN participants ON participants.id = songs.added_by
             WHERE songs.id = ?`,
          )
          .get(room.current_song_id)
      : null
    const queue = db
      .prepare(
        `SELECT songs.*, participants.nickname
         FROM songs
         JOIN participants ON participants.id = songs.added_by
         WHERE songs.room_id = ? AND songs.status = 'queued'
         ORDER BY songs.position ASC, songs.created_at ASC`,
      )
      .all(room.id)
    const participants = db
      .prepare(
        `SELECT id, nickname, avatar_url, is_manager
         FROM participants
         WHERE room_id = ?
         ORDER BY created_at ASC, rowid ASC`,
      )
      .all(room.id)

    return {
      code: room.code,
      retentionMode:
        room.retention_mode === 'permanent' ? 'permanent' : 'temporary',
      expiresAt:
        room.retention_mode === 'legacy' ? Number(room.expires_at) : null,
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
        isManager: Boolean(participant.is_manager),
      })),
      currentSong: serializeSong(current),
      queue: queue.map(serializeSong),
    }
  }

  function normalizeNickname(nickname) {
    const normalizedNickname = String(nickname ?? '').trim()
    if (normalizedNickname.length < 2 || normalizedNickname.length > 20) {
      throw new AppError(400, '닉네임은 2~20자로 입력해주세요.', 'INVALID_NICKNAME')
    }
    return normalizedNickname
  }

  function insertParticipant(
    room,
    {
      nickname: normalizedNickname,
      userId = null,
      profileSource = 'custom',
      avatarUrl = null,
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
    const isManager = !db
      .prepare(
        'SELECT 1 FROM participants WHERE room_id = ? AND is_manager = 1 LIMIT 1',
      )
      .get(room.id)
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
      },
    }
  }

  function createRoom({
    playbackMode = 'host_only',
    retentionMode = 'temporary',
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
    if (!RETENTION_MODES.has(retentionMode)) {
      throw new AppError(
        400,
        '방 유지 방식이 올바르지 않습니다.',
        'INVALID_RETENTION_MODE',
      )
    }
    if (retentionMode === 'permanent' && !ownerUserId) {
      throw new AppError(
        401,
        '영구 방을 만들려면 로그인해주세요.',
        'AUTH_REQUIRED',
      )
    }
    const normalizedNickname =
      nickname === undefined ? null : normalizeNickname(nickname)

    return transaction(db, () => {
      let code
      do {
        code = generateCode()
      } while (db.prepare('SELECT 1 FROM rooms WHERE code = ?').get(code))

      const id = crypto.randomUUID()
      const hostToken = createToken()
      const createdAt = now()
      db.prepare(
        `INSERT INTO rooms (
          id, code, host_token_hash, owner_user_id, retention_mode,
          empty_ttl_hours, playback_mode, playback_anchor_at, empty_since,
          created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        code,
        hashToken(hostToken),
        ownerUserId ? String(ownerUserId) : null,
        retentionMode,
        retentionMode === 'temporary'
          ? emptyRoomTtlMs / (60 * 60 * 1000)
          : null,
        playbackMode,
        createdAt,
        createdAt,
        createdAt,
        createdAt + roomTtlMs,
      )

      const joined = normalizedNickname
        ? insertParticipant(getRoomRecord(code), {
            nickname: normalizedNickname,
            userId: participantUserId,
            profileSource,
            avatarUrl,
          })
        : null
      return {
        code,
        hostToken,
        playbackMode,
        retentionMode,
        expiresAt: null,
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
         WHERE owner_user_id = ? AND retention_mode = 'permanent'
         ORDER BY created_at DESC`,
      )
      .all(String(userId))
      .map(({ code }) => getPublicRoom(code))
  }

  function deleteOwnedRoom(code, userId) {
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
      db.prepare('DELETE FROM rooms WHERE id = ?').run(room.id)
      return { code: room.code }
    })
  }

  function joinRoom(code, { nickname }) {
    const normalizedNickname = normalizeNickname(nickname)

    return transaction(db, () => {
      const room = getRoomRecord(code)
      const joined = insertParticipant(room, { nickname: normalizedNickname })

      const state = getPublicRoom(code)
      return {
        ...joined,
        room: state,
      }
    })
  }

  function getParticipantStatus(code, participantToken) {
    const room = getRoomRecord(code)
    const participant = requireParticipant(room, participantToken)
    return {
      id: participant.id,
      nickname: participant.nickname,
      avatarUrl: participant.avatar_url ?? null,
      isManager: Boolean(participant.is_manager),
    }
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
            isManager: Boolean(participant.is_manager),
          }
        : null,
      room: getPublicRoom(code),
    }
  }

  function addSong(code, participantToken, song) {
    return transaction(db, () => {
      const room = getRoomRecord(code)
      const participant = requireParticipant(room, participantToken)

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
          added_by, status, position, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    if (room.current_song_id) {
      db.prepare("UPDATE songs SET status = 'played' WHERE id = ?").run(
        room.current_song_id,
      )
    }
    const next = db
      .prepare(
        `SELECT id FROM songs
         WHERE room_id = ? AND status = 'queued'
         ORDER BY position ASC, created_at ASC LIMIT 1`,
      )
      .get(room.id)
    if (next) {
      db.prepare("UPDATE songs SET status = 'current' WHERE id = ?").run(next.id)
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

  function advance(code, credentials) {
    return transaction(db, () => {
      const room = getRoomRecord(code)
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
      return advanceRoom(room, code)
    })
  }

  function advanceCompletedAllDeviceRooms() {
    const checkedAt = now()
    const advancedRooms = []

    for (const candidate of findAllDevicesPlaybackRooms.all(checkedAt)) {
      const advanced = transaction(db, () => {
        const room = getRoomRecord(candidate.code)
        if (
          room.playback_mode !== 'all_devices' ||
          room.playback_paused ||
          !room.current_song_id
        ) {
          return null
        }

        const currentSong = db
          .prepare('SELECT duration_seconds FROM songs WHERE id = ?')
          .get(room.current_song_id)
        if (
          !currentSong ||
          getPlaybackPosition(room, checkedAt) < Number(currentSong.duration_seconds)
        ) {
          return null
        }

        return advanceRoom(room, candidate.code, checkedAt)
      })
      if (advanced) advancedRooms.push(advanced)
    }

    return advancedRooms
  }

  function setPlaybackPaused(code, credentials, paused) {
    if (typeof paused !== 'boolean') {
      throw new AppError(
        400,
        '재생 상태가 올바르지 않습니다.',
        'INVALID_PLAYBACK_STATE',
      )
    }

    return transaction(db, () => {
      const room = getRoomRecord(code)
      requireController(room, credentials)
      if (!room.current_song_id) {
        throw new AppError(
          409,
          '현재 재생 중인 곡이 없습니다.',
          'NO_CURRENT_SONG',
        )
      }
      const changedAt = now()
      const position = getPlaybackPosition(room, changedAt)
      db.prepare(
        `UPDATE rooms
         SET playback_paused = ?, playback_blocked = 0,
             playback_position_seconds = ?, playback_anchor_at = ?,
             playback_revision = playback_revision + 1
         WHERE id = ?`,
      ).run(paused ? 1 : 0, position, changedAt, room.id)
      return getPublicRoom(code)
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
      if (!hasHostAccess(room, hostToken)) {
        throw new AppError(403, '호스트 권한이 없습니다.', 'HOST_FORBIDDEN')
      }
      if (room.playback_mode === 'all_devices') {
        return getPublicRoom(code)
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
      const boundedPosition = Math.min(position, Number(currentSong.duration_seconds))
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
    if (!hasVolume) {
      throw new AppError(400, '변경할 설정이 없습니다.', 'EMPTY_SETTINGS')
    }

    return transaction(db, () => {
      const room = getRoomRecord(code)
      requireController(room, credentials)

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
          'SELECT id, is_manager FROM participants WHERE id = ? AND room_id = ?',
        )
        .get(String(targetParticipantId ?? ''), room.id)
      if (!target) {
        throw new AppError(
          404,
          '참여자를 찾지 못했습니다.',
          'PARTICIPANT_NOT_FOUND',
        )
      }
      if (Boolean(target.is_manager) === isManager) {
        return getPublicRoom(code)
      }

      if (!isManager) {
        const managerCount = Number(
          db
            .prepare(
              'SELECT COUNT(*) AS count FROM participants WHERE room_id = ? AND is_manager = 1',
            )
            .get(room.id).count,
        )
        if (managerCount <= 1) {
          throw new AppError(
            409,
            '최소 한 명의 관리자가 필요합니다.',
            'LAST_MANAGER_REQUIRED',
          )
        }
      }

      db.prepare(
        'UPDATE participants SET is_manager = ? WHERE id = ? AND room_id = ?',
      ).run(isManager ? 1 : 0, target.id, room.id)
      return getPublicRoom(code)
    })
  }

  function ensureOnlineManager(code, onlineParticipantIds = []) {
    return transaction(db, () => {
      const room = getRoomRecord(code)
      const onlineIds = new Set(
        Array.from(onlineParticipantIds, (participantId) =>
          String(participantId),
        ),
      )
      if (onlineIds.size === 0) return getPublicRoom(code)

      const participants = db
        .prepare(
          `SELECT id, is_manager
           FROM participants
           WHERE room_id = ?
           ORDER BY created_at ASC, rowid ASC`,
        )
        .all(room.id)
      if (
        participants.some(
          (participant) =>
            participant.is_manager && onlineIds.has(participant.id),
        )
      ) {
        return getPublicRoom(code)
      }

      const nextManager = participants.find((participant) =>
        onlineIds.has(participant.id),
      )
      if (!nextManager) return getPublicRoom(code)

      db.prepare(
        'UPDATE participants SET is_manager = 1 WHERE id = ? AND room_id = ?',
      ).run(nextManager.id, room.id)
      return getPublicRoom(code)
    })
  }

  function markRoomOccupied(code) {
    return db
      .prepare(
        `UPDATE rooms SET empty_since = NULL
         WHERE code = ?
           AND (retention_mode <> 'legacy' OR expires_at > ?)`,
      )
      .run(normalizeCode(code), now()).changes
  }

  function markRoomEmpty(code) {
    const changedAt = now()
    return db
      .prepare(
        `UPDATE rooms
         SET empty_since = COALESCE(empty_since, ?)
         WHERE code = ?
           AND (retention_mode <> 'legacy' OR expires_at > ?)`,
      )
      .run(changedAt, normalizeCode(code), changedAt).changes
  }

  function markAllRoomsEmpty() {
    const changedAt = now()
    return db
      .prepare(
        `UPDATE rooms
         SET empty_since = ?
         WHERE retention_mode <> 'legacy' OR expires_at > ?`,
      )
      .run(changedAt, changedAt).changes
  }

  function deleteExpiredRooms() {
    const checkedAt = now()
    return db
      .prepare(
        `DELETE FROM rooms
         WHERE (
           retention_mode = 'legacy'
           AND (
             expires_at <= ?
             OR (empty_since IS NOT NULL AND empty_since <= ?)
           )
         ) OR (
           retention_mode = 'temporary'
           AND empty_since IS NOT NULL
           AND empty_since <= ? - CAST(
             COALESCE(empty_ttl_hours, ?) * 60 * 60 * 1000 AS INTEGER
           )
         )`,
      )
      .run(
        checkedAt,
        checkedAt - emptyRoomTtlMs,
        checkedAt,
        emptyRoomTtlMs / (60 * 60 * 1000),
      ).changes
  }

  return {
    createRoom,
    joinRoom,
    getPublicRoom,
    getParticipantStatus,
    getRoomSession,
    listOwnedRooms,
    deleteOwnedRoom,
    listChatMessages,
    addChatMessage,
    addRoomEvent,
    hasActiveSession,
    getPresenceIdentity,
    addSong,
    advance,
    advanceCompletedAllDeviceRooms,
    setPlaybackPaused,
    startPlayback,
    reportPlaybackBlocked,
    removeSong,
    reorderSong,
    updateRoomSettings,
    setManager,
    ensureOnlineManager,
    markRoomOccupied,
    markRoomEmpty,
    markAllRoomsEmpty,
    deleteExpiredRooms,
  }
}

module.exports = { createRoomService, generateCode, hashToken, normalizeCode }
