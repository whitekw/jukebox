const crypto = require('node:crypto')
const { transaction } = require('./db')
const { AppError } = require('./errors')

const PAGE_SIZE = 20
const DAY_MS = 24 * 60 * 60 * 1000

function createAdminService(db, { discordIds = '', now = Date.now, onlineCount = () => 0 } = {}) {
  const allowedDiscordIds = new Set(
    String(discordIds).split(',').map((id) => id.trim()).filter((id) => /^\d{17,20}$/.test(id)),
  )

  function requireAdmin(user) {
    if (!user) throw new AppError(401, '로그인이 필요합니다.', 'AUTH_REQUIRED')
    if (!allowedDiscordIds.has(user.discordId)) {
      throw new AppError(403, '운영자 권한이 없습니다.', 'ADMIN_FORBIDDEN', {
        user: { discordId: user.discordId, displayName: user.displayName },
      })
    }
    return user
  }

  function pageOptions(input) {
    const parsed = Number(input)
    const page = Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, 10_000) : 1
    return { page, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }
  }

  function searchTerm(input) {
    return typeof input === 'string' ? input.trim().slice(0, 80) : ''
  }

  function listOverview(offsetInput = 0) {
    const offset = Number(offsetInput)
    const offsetMinutes = Number.isInteger(offset) && offset >= -720 && offset <= 840 ? offset : 0
    const currentTime = now()
    const roomCodes = db.prepare('SELECT code FROM rooms').all().map((room) => room.code)
    const onlineParticipants = roomCodes.reduce((sum, code) => sum + onlineCount(code), 0)
    const activeRooms = roomCodes.filter((code) => onlineCount(code) > 0).length
    const totals = {
      users: db.prepare('SELECT COUNT(*) AS count FROM users').get().count,
      rooms: roomCodes.length,
      activeRooms,
      onlineParticipants,
      queuedSongs: db.prepare("SELECT COUNT(*) AS count FROM songs WHERE status = 'queued'").get().count,
      playsToday: db.prepare(
        "SELECT COUNT(*) AS count FROM songs WHERE started_at >= ? AND status IN ('current', 'played')",
      ).get(currentTime - DAY_MS).count,
      totalPlays: db.prepare(
        "SELECT COUNT(*) AS count FROM songs WHERE started_at IS NOT NULL AND status IN ('current', 'played')",
      ).get().count,
    }
    const firstDay = currentTime - 13 * DAY_MS
    const firstKey = new Date(firstDay + offsetMinutes * 60_000).toISOString().slice(0, 10)
    const plays = db.prepare(
      `SELECT strftime('%Y-%m-%d', started_at / 1000 + ? * 60, 'unixepoch') AS day,
              COUNT(*) AS count
       FROM songs
       WHERE started_at IS NOT NULL AND status IN ('current', 'played')
         AND started_at >= ?
       GROUP BY day`,
    ).all(offsetMinutes, firstDay - DAY_MS)
    const createdRooms = db.prepare(
      `SELECT strftime('%Y-%m-%d', created_at / 1000 + ? * 60, 'unixepoch') AS day,
              COUNT(*) AS count
       FROM rooms WHERE created_at >= ? GROUP BY day`,
    ).all(offsetMinutes, firstDay - DAY_MS)
    const playsByDay = new Map(plays.map(({ day, count }) => [day, count]))
    const roomsByDay = new Map(createdRooms.map(({ day, count }) => [day, count]))
    const daily = Array.from({ length: 14 }, (_, index) => {
      const day = new Date(Date.parse(`${firstKey}T00:00:00Z`) + index * DAY_MS).toISOString().slice(0, 10)
      return { day, plays: playsByDay.get(day) ?? 0, rooms: roomsByDay.get(day) ?? 0 }
    })
    return { totals, daily, generatedAt: currentTime }
  }

  function listRooms(queryInput, pageInput) {
    const query = searchTerm(queryInput)
    const { page, limit, offset } = pageOptions(pageInput)
    const pattern = `%${query}%`
    const filter = `WHERE rooms.code LIKE ? OR rooms.title LIKE ?
      OR COALESCE(users.global_name, users.username, '') LIKE ?`
    const total = db.prepare(
      `SELECT COUNT(*) AS count FROM rooms LEFT JOIN users ON users.id = rooms.owner_user_id ${filter}`,
    ).get(pattern, pattern, pattern).count
    const rows = db.prepare(
      `SELECT rooms.code, rooms.title, rooms.created_at, rooms.playback_mode,
              rooms.playback_paused, rooms.history_autoplay,
              COALESCE(users.global_name, users.username) AS owner_name,
              (SELECT COUNT(*) FROM songs WHERE songs.room_id = rooms.id AND songs.status = 'queued') AS queue_count,
              (SELECT COUNT(*) FROM songs WHERE songs.room_id = rooms.id AND songs.started_at IS NOT NULL) AS play_count,
              (SELECT title FROM songs WHERE songs.id = rooms.current_song_id) AS current_title
       FROM rooms LEFT JOIN users ON users.id = rooms.owner_user_id
       ${filter} ORDER BY rooms.created_at DESC, rooms.code ASC LIMIT ? OFFSET ?`,
    ).all(pattern, pattern, pattern, limit, offset)
    return {
      items: rows.map((row) => ({
        code: row.code, title: row.title, createdAt: row.created_at,
        playbackMode: row.playback_mode, playbackPaused: Boolean(row.playback_paused),
        historyAutoplay: Boolean(row.history_autoplay), ownerName: row.owner_name ?? null,
        queueCount: row.queue_count, playCount: row.play_count,
        currentTitle: row.current_title ?? null, onlineParticipants: onlineCount(row.code),
      })),
      total, page, pageSize: PAGE_SIZE,
    }
  }

  function getRoom(codeInput) {
    const code = String(codeInput ?? '').trim().toUpperCase()
    const room = db.prepare(
      `SELECT rooms.id, rooms.code, rooms.title, rooms.created_at, rooms.playback_mode,
              rooms.playback_paused, rooms.history_autoplay, rooms.allow_guests,
              COALESCE(users.global_name, users.username) AS owner_name,
              users.discord_id AS owner_discord_id
       FROM rooms LEFT JOIN users ON users.id = rooms.owner_user_id WHERE rooms.code = ?`,
    ).get(code)
    if (!room) throw new AppError(404, '방을 찾지 못했습니다.', 'ROOM_NOT_FOUND')
    const participants = db.prepare(
      `SELECT id, nickname, user_id, is_manager, left_at, created_at
       FROM participants WHERE room_id = ? ORDER BY created_at DESC LIMIT 100`,
    ).all(room.id).map((participant) => ({
      id: participant.id, nickname: participant.nickname,
      isMember: Boolean(participant.user_id), isManager: Boolean(participant.is_manager),
      online: participant.left_at === null && onlineCount(code, participant.id) > 0,
      leftAt: participant.left_at, createdAt: participant.created_at,
    }))
    const songs = db.prepare(
      `SELECT id, title, artist, thumbnail_url, status, is_autoplay,
              started_at, created_at
       FROM songs WHERE room_id = ? AND status IN ('current', 'queued', 'played')
       ORDER BY CASE status WHEN 'current' THEN 0 WHEN 'queued' THEN 1 ELSE 2 END,
                CASE WHEN status = 'queued' THEN position ELSE -COALESCE(started_at, created_at) END ASC
       LIMIT 50`,
    ).all(room.id).map((song) => ({
      id: song.id, title: song.title, artist: song.artist,
      thumbnailUrl: song.thumbnail_url, status: song.status,
      isAutoplay: Boolean(song.is_autoplay), startedAt: song.started_at,
      createdAt: song.created_at,
    }))
    return {
      code: room.code, title: room.title, createdAt: room.created_at,
      playbackMode: room.playback_mode, playbackPaused: Boolean(room.playback_paused),
      historyAutoplay: Boolean(room.history_autoplay), allowGuests: Boolean(room.allow_guests),
      ownerName: room.owner_name ?? null, ownerDiscordId: room.owner_discord_id ?? null,
      onlineParticipants: onlineCount(code), participants, songs,
    }
  }

  function listUsers(queryInput, pageInput, currentTime = now()) {
    const query = searchTerm(queryInput)
    const { page, limit, offset } = pageOptions(pageInput)
    const pattern = `%${query}%`
    const filter = 'WHERE users.discord_id LIKE ? OR users.username LIKE ? OR COALESCE(users.global_name, \'\') LIKE ?'
    const total = db.prepare(`SELECT COUNT(*) AS count FROM users ${filter}`)
      .get(pattern, pattern, pattern).count
    const items = db.prepare(
      `SELECT users.id, users.discord_id, users.username, users.global_name,
              users.created_at, users.last_login_at,
              (SELECT COUNT(*) FROM rooms WHERE owner_user_id = users.id) AS owned_rooms,
              (SELECT COUNT(*) FROM auth_sessions WHERE user_id = users.id AND expires_at > ?) AS active_sessions
       FROM users ${filter}
       ORDER BY users.last_login_at DESC, users.id ASC LIMIT ? OFFSET ?`,
    ).all(currentTime, pattern, pattern, pattern, limit, offset)
      .map((row) => ({
        id: row.id, discordId: row.discord_id, username: row.username,
        displayName: row.global_name || row.username,
        createdAt: row.created_at, lastLoginAt: row.last_login_at,
        ownedRooms: row.owned_rooms, activeSessions: row.active_sessions,
      }))
    return { items, total, page, pageSize: PAGE_SIZE }
  }

  function listAudit(limitInput = 30) {
    const limit = Math.max(1, Math.min(Number(limitInput) || 30, 100))
    return db.prepare(
      `SELECT id, admin_discord_id, action, target_type, target_id, created_at
       FROM admin_audit_entries ORDER BY created_at DESC, rowid DESC LIMIT ?`,
    ).all(limit).map((row) => ({
      id: row.id, adminDiscordId: row.admin_discord_id, action: row.action,
      targetType: row.target_type, targetId: row.target_id, createdAt: row.created_at,
    }))
  }

  function recordAction(adminUser, action, targetType, targetId) {
    db.prepare(
      `INSERT INTO admin_audit_entries
       (id, admin_user_id, admin_discord_id, action, target_type, target_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(crypto.randomUUID(), adminUser.id, adminUser.discordId, action, targetType, targetId, now())
  }

  function revokeUserSessions(adminUser, userId) {
    if (adminUser.id === userId) {
      throw new AppError(400, '자신의 세션은 운영 화면에서 해제할 수 없습니다.', 'ADMIN_SELF_REVOKE')
    }
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId)
    if (!user) throw new AppError(404, '사용자를 찾지 못했습니다.', 'USER_NOT_FOUND')
    return transaction(db, () => {
      const hashes = db.prepare('SELECT token_hash FROM auth_sessions WHERE user_id = ?')
        .all(userId).map(({ token_hash }) => token_hash)
      db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(userId)
      recordAction(adminUser, 'sessions_revoked', 'user', userId)
      return hashes
    })
  }

  return { requireAdmin, listOverview, listRooms, getRoom, listUsers, listAudit, recordAction, revokeUserSessions }
}

module.exports = { createAdminService }
