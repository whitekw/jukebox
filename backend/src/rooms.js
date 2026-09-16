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
  const now = options.now ?? Date.now

  const findRoom = db.prepare(
    'SELECT * FROM rooms WHERE code = ? AND expires_at > ?',
  )
  const findParticipant = db.prepare(
    'SELECT * FROM participants WHERE room_id = ? AND token_hash = ?',
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
    if (participant.id !== room.manager_participant_id) {
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
    if (room.playback_paused || room.playback_blocked) return position
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
        `SELECT id, nickname
         FROM participants
         WHERE room_id = ?
         ORDER BY created_at ASC, rowid ASC`,
      )
      .all(room.id)

    return {
      code: room.code,
      expiresAt: room.expires_at,
      maxSongsPerParticipant: room.max_songs_per_participant,
      managerParticipantId: room.manager_participant_id,
      hostVolume: room.host_volume,
      playbackMode: room.playback_mode,
      playbackPaused: Boolean(room.playback_paused),
      playbackBlocked: Boolean(room.playback_blocked),
      playbackPositionSeconds: Number(room.playback_position_seconds),
      playbackAnchorAt: Number(room.playback_anchor_at),
      playbackRevision: Number(room.playback_revision),
      serverTime,
      participants: participants.map((participant) => ({
        id: participant.id,
        nickname: participant.nickname,
        isManager: participant.id === room.manager_participant_id,
      })),
      currentSong: serializeSong(current),
      queue: queue.map(serializeSong),
    }
  }

  function createRoom({
    maxSongsPerParticipant = 2,
    playbackMode = 'host_only',
  } = {}) {
    const maximum = Number(maxSongsPerParticipant)
    if (!Number.isInteger(maximum) || maximum < 1 || maximum > 10) {
      throw new AppError(400, '참여자별 곡 수는 1~10 사이여야 합니다.', 'INVALID_MAX_SONGS')
    }
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
        id, code, host_token_hash, max_songs_per_participant, playback_mode,
        playback_anchor_at, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      code,
      hashToken(hostToken),
      maximum,
      playbackMode,
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
      const participant = {
        id: crypto.randomUUID(),
        roomId: room.id,
        tokenHash: hashToken(participantToken),
        nickname: normalizedNickname,
        createdAt: now(),
      }
      db.prepare(
        `INSERT INTO participants (id, room_id, token_hash, nickname, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(
        participant.id,
        participant.roomId,
        participant.tokenHash,
        participant.nickname,
        participant.createdAt,
      )
      db.prepare(
        `UPDATE rooms
         SET manager_participant_id = COALESCE(manager_participant_id, ?)
         WHERE id = ?`,
      ).run(participant.id, room.id)

      const state = getPublicRoom(code)
      return {
        participantToken,
        participant: {
          id: participant.id,
          nickname: participant.nickname,
          isManager: state.managerParticipantId === participant.id,
        },
        room: state,
      }
    })
  }

  function getParticipantStatus(code, participantToken) {
    const room = getRoomRecord(code)
    const participant = requireParticipant(room, participantToken)
    const activeCount = db
      .prepare(
        `SELECT COUNT(*) AS count FROM songs
         WHERE room_id = ? AND added_by = ? AND status IN ('queued', 'current')`,
      )
      .get(room.id, participant.id).count
    return {
      id: participant.id,
      nickname: participant.nickname,
      isManager: participant.id === room.manager_participant_id,
      songsLeft: Math.max(0, room.max_songs_per_participant - Number(activeCount)),
    }
  }

  function addSong(code, participantToken, song) {
    return transaction(db, () => {
      const room = getRoomRecord(code)
      const participant = requireParticipant(room, participantToken)
      const activeCount = Number(
        db
          .prepare(
            `SELECT COUNT(*) AS count FROM songs
             WHERE room_id = ? AND added_by = ? AND status IN ('queued', 'current')`,
          )
          .get(room.id, participant.id).count,
      )
      if (activeCount >= room.max_songs_per_participant) {
        throw new AppError(
          409,
          `한 번에 최대 ${room.max_songs_per_participant}곡까지 추가할 수 있습니다.`,
          'SONG_LIMIT_REACHED',
          { maxSongs: room.max_songs_per_participant },
        )
      }

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
               playback_revision = playback_revision + 1
           WHERE id = ?`,
        ).run(id, createdAt, room.id)
      }
      return getPublicRoom(code)
    })
  }

  function advance(code, credentials) {
    return transaction(db, () => {
      const room = getRoomRecord(code)
      requireController(room, credentials)
      const changedAt = now()
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
             playback_revision = playback_revision + 1
         WHERE id = ?`,
      ).run(
        next?.id ?? null,
        changedAt,
        room.id,
      )
      return getPublicRoom(code)
    })
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
      requireController(room, credentials)
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

  function moveSong(code, credentials, songId, direction) {
    if (!['up', 'down'].includes(direction)) {
      throw new AppError(400, '이동 방향이 올바르지 않습니다.', 'INVALID_DIRECTION')
    }
    return transaction(db, () => {
      const room = getRoomRecord(code)
      requireController(room, credentials)
      const song = db
        .prepare(
          "SELECT * FROM songs WHERE id = ? AND room_id = ? AND status = 'queued'",
        )
        .get(songId, room.id)
      if (!song) throw new AppError(404, '대기 곡을 찾지 못했습니다.', 'SONG_NOT_FOUND')

      const comparator = direction === 'up' ? '<' : '>'
      const order = direction === 'up' ? 'DESC' : 'ASC'
      const neighbor = db
        .prepare(
          `SELECT * FROM songs
           WHERE room_id = ? AND status = 'queued' AND position ${comparator} ?
           ORDER BY position ${order}, created_at ${order} LIMIT 1`,
        )
        .get(room.id, song.position)
      if (!neighbor) return getPublicRoom(code)

      const temporaryPosition = -now()
      db.prepare('UPDATE songs SET position = ? WHERE id = ?').run(
        temporaryPosition,
        song.id,
      )
      db.prepare('UPDATE songs SET position = ? WHERE id = ?').run(
        song.position,
        neighbor.id,
      )
      db.prepare('UPDATE songs SET position = ? WHERE id = ?').run(
        neighbor.position,
        song.id,
      )
      return getPublicRoom(code)
    })
  }

  function updateRoomSettings(code, credentials, settings = {}) {
    const hasMaximum = settings.maxSongsPerParticipant !== undefined
    const hasVolume = settings.hostVolume !== undefined
    if (!hasMaximum && !hasVolume) {
      throw new AppError(400, '변경할 설정이 없습니다.', 'EMPTY_SETTINGS')
    }

    return transaction(db, () => {
      const room = getRoomRecord(code)
      requireController(room, credentials)

      if (hasMaximum) {
        const maximum = Number(settings.maxSongsPerParticipant)
        if (!Number.isInteger(maximum) || maximum < 1 || maximum > 10) {
          throw new AppError(
            400,
            '참여자별 곡 수는 1~10 사이여야 합니다.',
            'INVALID_MAX_SONGS',
          )
        }
        db.prepare(
          'UPDATE rooms SET max_songs_per_participant = ? WHERE id = ?',
        ).run(maximum, room.id)
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

      return getPublicRoom(code)
    })
  }

  function transferManager(code, participantToken, targetParticipantId) {
    return transaction(db, () => {
      const room = getRoomRecord(code)
      const manager = requireManager(room, participantToken)
      const target = db
        .prepare(
          'SELECT id FROM participants WHERE id = ? AND room_id = ?',
        )
        .get(String(targetParticipantId ?? ''), room.id)
      if (!target) {
        throw new AppError(
          404,
          '권한을 넘길 참여자를 찾지 못했습니다.',
          'PARTICIPANT_NOT_FOUND',
        )
      }
      if (target.id === manager.id) {
        throw new AppError(
          400,
          '이미 관리 권한을 가진 참여자입니다.',
          'ALREADY_MANAGER',
        )
      }

      db.prepare(
        'UPDATE rooms SET manager_participant_id = ? WHERE id = ?',
      ).run(target.id, room.id)
      return getPublicRoom(code)
    })
  }

  function deleteExpiredRooms() {
    return db.prepare('DELETE FROM rooms WHERE expires_at <= ?').run(now()).changes
  }

  return {
    createRoom,
    joinRoom,
    getPublicRoom,
    getParticipantStatus,
    addSong,
    advance,
    setPlaybackPaused,
    reportPlaybackBlocked,
    removeSong,
    moveSong,
    updateRoomSettings,
    transferManager,
    deleteExpiredRooms,
  }
}

module.exports = { createRoomService, generateCode, hashToken, normalizeCode }
