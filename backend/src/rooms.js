const crypto = require('node:crypto')
const { transaction } = require('./db')
const { AppError } = require('./errors')

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const PLAYBACK_MODES = new Set(['host_only', 'all_devices'])

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
    'SELECT * FROM rooms WHERE code = ? AND expires_at > ?',
  )
  const findParticipant = db.prepare(
    'SELECT * FROM participants WHERE room_id = ? AND token_hash = ?',
  )
  const findAllDevicesPlaybackRooms = db.prepare(
    `SELECT rooms.code
     FROM rooms
     WHERE rooms.expires_at > ?
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
    const participant = normalizedCredentials.participantToken
      ? findParticipant.get(
          room.id,
          hashToken(normalizedCredentials.participantToken),
        )
      : null
    return { isHost, participant }
  }

  function hasActiveSession(code, credentials = {}) {
    const room = getRoomRecord(code)
    const identity = getSessionIdentity(room, credentials)
    return identity.isHost || Boolean(identity.participant)
  }

  function getPresenceIdentity(code, credentials = {}) {
    const room = getRoomRecord(code)
    const identity = getSessionIdentity(room, credentials)
    return {
      isHost: identity.isHost,
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
        `SELECT id, nickname, is_manager
         FROM participants
         WHERE room_id = ?
         ORDER BY created_at ASC, rowid ASC`,
      )
      .all(room.id)

    return {
      code: room.code,
      expiresAt: room.expires_at,
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
        isManager: Boolean(participant.is_manager),
      })),
      currentSong: serializeSong(current),
      queue: queue.map(serializeSong),
    }
  }

  function createRoom({ playbackMode = 'host_only' } = {}) {
    if (!PLAYBACK_MODES.has(playbackMode)) {
      throw new AppError(
        400,
        '재생 방식이 올바르지 않습니다.',
        'INVALID_PLAYBACK_MODE',
      )
    }

    let code
    do {
      code = generateCode()
    } while (db.prepare('SELECT 1 FROM rooms WHERE code = ?').get(code))

    const id = crypto.randomUUID()
    const hostToken = createToken()
    const createdAt = now()
    db.prepare(
      `INSERT INTO rooms (
        id, code, host_token_hash, playback_mode,
        playback_anchor_at, empty_since, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      code,
      hashToken(hostToken),
      playbackMode,
      createdAt,
      createdAt,
      createdAt,
      createdAt + roomTtlMs,
    )

    return {
      code,
      hostToken,
      playbackMode,
      expiresAt: createdAt + roomTtlMs,
    }
  }

  function joinRoom(code, { nickname }) {
    const normalizedNickname = String(nickname ?? '').trim()
    if (normalizedNickname.length < 2 || normalizedNickname.length > 20) {
      throw new AppError(400, '닉네임은 2~20자로 입력해주세요.', 'INVALID_NICKNAME')
    }

    return transaction(db, () => {
      const room = getRoomRecord(code)
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
        isManager,
        createdAt: now(),
      }
      db.prepare(
        `INSERT INTO participants (
          id, room_id, token_hash, nickname, is_manager, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        participant.id,
        participant.roomId,
        participant.tokenHash,
        participant.nickname,
        participant.isManager ? 1 : 0,
        participant.createdAt,
      )

      const state = getPublicRoom(code)
      return {
        participantToken,
        participant: {
          id: participant.id,
          nickname: participant.nickname,
          isManager: participant.isManager,
        },
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
      isManager: Boolean(participant.is_manager),
    }
  }

  function getRoomSession(code, credentials = {}) {
    const room = getRoomRecord(code)
    const { isHost, participant } = getSessionIdentity(room, credentials)
    if (!isHost && !participant) {
      throw new AppError(
        401,
        '이 방의 저장된 세션이 유효하지 않습니다.',
        'ROOM_SESSION_INVALID',
      )
    }
    return {
      isHost,
      participant: participant
        ? {
            id: participant.id,
            nickname: participant.nickname,
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
      requireController(room, credentials)
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

  function setManager(code, participantToken, targetParticipantId, isManager) {
    if (typeof isManager !== 'boolean') {
      throw new AppError(
        400,
        '관리자 상태가 올바르지 않습니다.',
        'INVALID_MANAGER_STATE',
      )
    }

    return transaction(db, () => {
      const room = getRoomRecord(code)
      requireManager(room, participantToken)
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
      .prepare('UPDATE rooms SET empty_since = NULL WHERE code = ? AND expires_at > ?')
      .run(normalizeCode(code), now()).changes
  }

  function markRoomEmpty(code) {
    const changedAt = now()
    return db
      .prepare(
        `UPDATE rooms
         SET empty_since = COALESCE(empty_since, ?)
         WHERE code = ? AND expires_at > ?`,
      )
      .run(changedAt, normalizeCode(code), changedAt).changes
  }

  function markAllRoomsEmpty() {
    const changedAt = now()
    return db
      .prepare(
        `UPDATE rooms
         SET empty_since = ?
         WHERE expires_at > ?`,
      )
      .run(changedAt, changedAt).changes
  }

  function deleteExpiredRooms() {
    const checkedAt = now()
    return db
      .prepare(
        `DELETE FROM rooms
         WHERE expires_at <= ?
            OR (empty_since IS NOT NULL AND empty_since <= ?)`,
      )
      .run(checkedAt, checkedAt - emptyRoomTtlMs).changes
  }

  return {
    createRoom,
    joinRoom,
    getPublicRoom,
    getParticipantStatus,
    getRoomSession,
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
