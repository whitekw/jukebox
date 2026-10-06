const crypto = require('node:crypto')
const { AppError } = require('./errors')

// Include videos that only have an autoplay exclusion, a suggestion or activity.
const ROOM_VIDEOS_QUERY = `WITH room_songs AS (SELECT * FROM songs WHERE room_id = ?),
  suggestions AS (SELECT * FROM room_autoplay_suggestions WHERE room_id = ?),
  excluded AS (SELECT value AS video_id FROM rooms, json_each(autoplay_excluded_video_ids) WHERE rooms.id = ?),
  activities AS (SELECT CASE WHEN json_valid(event_data) THEN json_extract(event_data, '$.videoId') END AS video_id,
    CASE WHEN json_valid(event_data) THEN json_extract(event_data, '$.title') END AS title
    FROM room_feed_entries WHERE room_id = ? AND entry_type = 'system'
      AND event_type IN ('song_added', 'song_skipped', 'song_removed', 'queue_reordered')),
  videos AS (SELECT video_id FROM room_songs UNION SELECT video_id FROM suggestions UNION SELECT video_id FROM excluded
    UNION SELECT video_id FROM activities WHERE typeof(video_id) = 'text' AND length(video_id) > 0)
  SELECT videos.video_id AS videoId,
    COALESCE((SELECT title FROM room_songs WHERE video_id = videos.video_id ORDER BY created_at DESC, id LIMIT 1),
      (SELECT title FROM suggestions WHERE video_id = videos.video_id LIMIT 1),
      (SELECT title FROM activities WHERE video_id = videos.video_id AND title != '' LIMIT 1), videos.video_id) AS title,
    COALESCE((SELECT artist FROM room_songs WHERE video_id = videos.video_id ORDER BY created_at DESC, id LIMIT 1),
      (SELECT artist FROM suggestions WHERE video_id = videos.video_id LIMIT 1), '') AS artist,
    (SELECT COUNT(*) FROM room_songs WHERE video_id = videos.video_id) AS songs,
    (SELECT COUNT(*) FROM room_songs WHERE video_id = videos.video_id AND started_at IS NOT NULL AND play_count_excluded = 0) AS plays,
    (SELECT COUNT(*) FROM room_songs WHERE video_id = videos.video_id AND status = 'queued') AS queuedSongs,
    (SELECT COUNT(*) FROM room_songs WHERE video_id = videos.video_id AND status = 'current') AS currentSongs,
    (SELECT COUNT(*) FROM room_songs WHERE video_id = videos.video_id AND playback_error_code IS NOT NULL) AS failedSongs,
    EXISTS(SELECT 1 FROM excluded WHERE video_id = videos.video_id) AS autoplayExcluded,
    COALESCE((SELECT MAX(COALESCE(started_at, created_at)) FROM room_songs WHERE video_id = videos.video_id), 0) AS lastSeenAt
  FROM videos`

function readRoomVideoRecords(db, codeInput, videoId) {
  const code = String(codeInput ?? '').trim().toUpperCase()
  const room = db.prepare('SELECT * FROM rooms WHERE code = ?').get(code)
  if (!room) throw new AppError(404, '방을 찾지 못했습니다.', 'ROOM_NOT_FOUND')
  const video = db.prepare(`SELECT * FROM (${ROOM_VIDEOS_QUERY}) WHERE videoId = ?`)
    .get(room.id, room.id, room.id, room.id, String(videoId ?? ''))
  if (!video) throw new AppError(404, '이 방의 영상을 찾지 못했습니다.', 'ROOM_VIDEO_NOT_FOUND')
  const songs = db.prepare('SELECT id, status, started_at, playback_error_code, play_count_excluded FROM songs WHERE room_id = ? AND video_id = ? ORDER BY id')
    .all(room.id, video.videoId)
  const votes = db.prepare(`SELECT song_id, voter_participant_id, vote, updated_at FROM song_votes
    WHERE room_id = ? AND song_id IN (SELECT id FROM songs WHERE room_id = ? AND video_id = ?)
    ORDER BY song_id, voter_participant_id`).all(room.id, room.id, video.videoId)
  // Older activity entries only have titles. Match those only if no other video
  // in this room shares the title; plain chat messages are never matched.
  const feedQuery = `SELECT id, sequence FROM room_feed_entries WHERE room_id = ? AND entry_type = 'system'
    AND event_type IN ('song_added', 'song_skipped', 'song_removed', 'queue_reordered')
    AND CASE WHEN json_valid(event_data) THEN
      json_extract(event_data, '$.videoId') = ? OR
      json_extract(event_data, '$.songId') IN (SELECT id FROM songs WHERE room_id = ? AND video_id = ?) OR
      (json_extract(event_data, '$.videoId') IS NULL AND json_extract(event_data, '$.songId') IS NULL AND
        json_extract(event_data, '$.title') IN (
          SELECT title FROM songs WHERE room_id = ? AND video_id = ?
          UNION SELECT title FROM room_autoplay_suggestions WHERE room_id = ? AND video_id = ?
          EXCEPT SELECT title FROM songs WHERE room_id = ? AND video_id != ?
          EXCEPT SELECT title FROM room_autoplay_suggestions WHERE room_id = ? AND video_id != ?
        )) ELSE 0 END ORDER BY id`
  const feedParams = [room.id, video.videoId, room.id, video.videoId,
    room.id, video.videoId, room.id, video.videoId, room.id, video.videoId, room.id, video.videoId]
  const feed = db.prepare(feedQuery).all(...feedParams)
  const preview = {
    code: room.code, roomTitle: room.title,
    target: { videoId: video.videoId, title: video.title, artist: video.artist },
    counts: { songs: video.songs, plays: songs.filter(({ started_at }) => started_at !== null).length, queuedSongs: video.queuedSongs,
      currentSongs: video.currentSongs, failedSongs: video.failedSongs, votes: votes.length,
      events: feed.length, autoplayExclusions: Number(video.autoplayExcluded) },
    revision: crypto.createHash('sha256').update(JSON.stringify({
      videoId: video.videoId, songs, votes, feed, autoplayExcluded: video.autoplayExcluded,
    })).digest('hex'),
  }
  return { room, preview, feedQuery, feedParams }
}

function deleteRoomVideoRecords(db, { room, preview, feedQuery, feedParams }) {
  db.prepare(`DELETE FROM room_feed_entries WHERE id IN (SELECT id FROM (${feedQuery}))`).run(...feedParams)
  // Votes cascade with all requests, including removed/failed and autoplay ones.
  db.prepare('DELETE FROM songs WHERE room_id = ? AND video_id = ?').run(room.id, preview.target.videoId)
  const excluded = JSON.parse(room.autoplay_excluded_video_ids).filter((id) => id !== preview.target.videoId)
  db.prepare('UPDATE rooms SET autoplay_excluded_video_ids = ? WHERE id = ?').run(JSON.stringify(excluded), room.id)
  db.prepare('DELETE FROM room_autoplay_suggestions WHERE room_id = ?').run(room.id)
}

module.exports = { ROOM_VIDEOS_QUERY, readRoomVideoRecords, deleteRoomVideoRecords }
