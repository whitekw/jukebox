const crypto = require('node:crypto')
const { AppError } = require('./errors')
const { transaction } = require('./db')

function createLibraryService(db) {
  function ensureFavorites(userId) {
    let favorites = db.prepare(
      "SELECT id FROM playlists WHERE owner_user_id = ? AND kind = 'favorites'",
    ).get(userId)
    if (!favorites) {
      const now = Date.now()
      db.prepare(
        `INSERT INTO playlists (id, owner_user_id, name, kind, created_at, updated_at)
         VALUES (?, ?, '', 'favorites', ?, ?)`,
      ).run(crypto.randomUUID(), userId, now, now)
      favorites = db.prepare(
        "SELECT id FROM playlists WHERE owner_user_id = ? AND kind = 'favorites'",
      ).get(userId)
    }
    return favorites.id
  }

  function requireOwnedPlaylist(userId, playlistId) {
    const playlist = db.prepare(
      'SELECT id, kind FROM playlists WHERE id = ? AND owner_user_id = ?',
    ).get(playlistId, userId)
    if (!playlist) throw new AppError(404, '플레이리스트를 찾지 못했습니다.', 'PLAYLIST_NOT_FOUND')
    return playlist
  }

  function requireCustomPlaylist(userId, playlistId) {
    const playlist = requireOwnedPlaylist(userId, playlistId)
    if (playlist.kind !== 'custom') {
      throw new AppError(403, '기본 플레이리스트는 변경할 수 없습니다.', 'PLAYLIST_IMMUTABLE')
    }
    return playlist
  }

  function validName(name) {
    const trimmed = typeof name === 'string' ? name.trim() : ''
    if (!trimmed || trimmed.length > 60) {
      throw new AppError(400, '플레이리스트 이름은 1~60자로 입력해주세요.', 'INVALID_PLAYLIST_NAME')
    }
    return trimmed
  }

  function list(userId, videoId = null) {
    ensureFavorites(userId)
    return db.prepare(
      `SELECT playlists.id, playlists.name, playlists.kind, playlists.updated_at AS updatedAt,
              COUNT(playlist_tracks.video_id) AS trackCount,
              MAX(CASE WHEN playlist_tracks.video_id = ? THEN 1 ELSE 0 END) AS containsTrack,
              (SELECT library_tracks.thumbnail_url FROM playlist_tracks AS latest
               JOIN library_tracks ON library_tracks.video_id = latest.video_id
               WHERE latest.playlist_id = playlists.id
               ORDER BY latest.added_at DESC LIMIT 1) AS thumbnailUrl
       FROM playlists
       LEFT JOIN playlist_tracks ON playlist_tracks.playlist_id = playlists.id
       WHERE playlists.owner_user_id = ?
       GROUP BY playlists.id
       ORDER BY CASE playlists.kind WHEN 'favorites' THEN 0 ELSE 1 END,
                playlists.updated_at DESC, playlists.created_at DESC`,
    ).all(videoId, userId).map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind,
      updatedAt: row.updatedAt,
      trackCount: row.trackCount,
      containsTrack: Boolean(row.containsTrack),
      thumbnailUrl: row.thumbnailUrl,
    }))
  }

  function listTracks(userId, playlistId) {
    requireOwnedPlaylist(userId, playlistId)
    return db.prepare(
      `SELECT library_tracks.video_id AS videoId, library_tracks.title,
              library_tracks.artist, library_tracks.duration_seconds AS durationSeconds,
              library_tracks.thumbnail_url AS thumbnailUrl, playlist_tracks.added_at AS addedAt
       FROM playlist_tracks
       JOIN library_tracks ON library_tracks.video_id = playlist_tracks.video_id
       WHERE playlist_tracks.playlist_id = ?
       ORDER BY playlist_tracks.added_at DESC, library_tracks.video_id`,
    ).all(playlistId)
  }

  function create(userId, name) {
    const trimmed = validName(name)
    const now = Date.now()
    const id = crypto.randomUUID()
    db.prepare(
      `INSERT INTO playlists (id, owner_user_id, name, kind, created_at, updated_at)
       VALUES (?, ?, ?, 'custom', ?, ?)`,
    ).run(id, userId, trimmed, now, now)
    return { id, name: trimmed, kind: 'custom', updatedAt: now, trackCount: 0, containsTrack: false, thumbnailUrl: null }
  }

  function rename(userId, playlistId, name) {
    requireCustomPlaylist(userId, playlistId)
    const trimmed = validName(name)
    const updatedAt = Date.now()
    db.prepare('UPDATE playlists SET name = ?, updated_at = ? WHERE id = ?')
      .run(trimmed, updatedAt, playlistId)
    return { id: playlistId, name: trimmed, updatedAt }
  }

  function remove(userId, playlistId) {
    requireCustomPlaylist(userId, playlistId)
    db.prepare('DELETE FROM playlists WHERE id = ?').run(playlistId)
    return { deleted: true }
  }

  function addTrack(userId, playlistId, roomSongId) {
    if (typeof roomSongId !== 'string' || !roomSongId) {
      throw new AppError(400, '저장할 곡을 선택해주세요.', 'INVALID_LIBRARY_SONG')
    }
    return transaction(db, () => {
      requireOwnedPlaylist(userId, playlistId)
      const song = db.prepare(
        `SELECT video_id, title, artist, duration_seconds, thumbnail_url
         FROM songs WHERE id = ?`,
      ).get(roomSongId)
      if (!song) throw new AppError(404, '곡을 찾지 못했습니다.', 'SONG_NOT_FOUND')
      const now = Date.now()
      db.prepare(
        `INSERT INTO library_tracks (video_id, title, artist, duration_seconds, thumbnail_url, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(video_id) DO UPDATE SET title = excluded.title,
           artist = excluded.artist, duration_seconds = excluded.duration_seconds,
           thumbnail_url = excluded.thumbnail_url, updated_at = excluded.updated_at`,
      ).run(song.video_id, song.title, song.artist, song.duration_seconds, song.thumbnail_url, now)
      const result = db.prepare(
        `INSERT OR IGNORE INTO playlist_tracks (playlist_id, video_id, added_at)
         VALUES (?, ?, ?)`,
      ).run(playlistId, song.video_id, now)
      if (result.changes) {
        db.prepare('UPDATE playlists SET updated_at = ? WHERE id = ?').run(now, playlistId)
      }
      return { videoId: song.video_id, added: true }
    })
  }

  function addExistingTrack(userId, playlistId, videoId) {
    if (typeof videoId !== 'string' || !videoId) {
      throw new AppError(400, '저장할 곡을 선택해주세요.', 'INVALID_LIBRARY_SONG')
    }
    return transaction(db, () => {
      requireOwnedPlaylist(userId, playlistId)
      const track = db.prepare('SELECT video_id FROM library_tracks WHERE video_id = ?').get(videoId)
      if (!track) throw new AppError(404, '곡을 찾지 못했습니다.', 'SONG_NOT_FOUND')
      const now = Date.now()
      const result = db.prepare(
        `INSERT OR IGNORE INTO playlist_tracks (playlist_id, video_id, added_at)
         VALUES (?, ?, ?)`,
      ).run(playlistId, videoId, now)
      if (result.changes) {
        db.prepare('UPDATE playlists SET updated_at = ? WHERE id = ?').run(now, playlistId)
      }
      return { videoId, added: true }
    })
  }

  function removeTrack(userId, playlistId, videoId) {
    return transaction(db, () => {
      requireOwnedPlaylist(userId, playlistId)
      const result = db.prepare(
        'DELETE FROM playlist_tracks WHERE playlist_id = ? AND video_id = ?',
      ).run(playlistId, videoId)
      if (result.changes) {
        db.prepare('UPDATE playlists SET updated_at = ? WHERE id = ?').run(Date.now(), playlistId)
      }
      return { videoId, added: false }
    })
  }

  return { list, listTracks, create, rename, remove, addTrack, addExistingTrack, removeTrack }
}

module.exports = { createLibraryService }
