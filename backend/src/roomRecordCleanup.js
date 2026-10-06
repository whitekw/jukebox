const crypto = require('node:crypto')
const { AppError } = require('./errors')

function readRoomUserRecords(db, codeInput, participantId) {
  const code = String(codeInput ?? '').trim().toUpperCase()
  const room = db.prepare('SELECT * FROM rooms WHERE code = ?').get(code)
  if (!room) throw new AppError(404, '방을 찾지 못했습니다.', 'ROOM_NOT_FOUND')
  const target = db.prepare(
    `SELECT participants.*, users.discord_id FROM participants
     LEFT JOIN users ON users.id = participants.user_id
     WHERE participants.room_id = ? AND participants.id = ?`,
  ).get(room.id, String(participantId ?? ''))
  if (!target || target.id === `autoplay:${room.id}`) {
    throw new AppError(404, '참여자를 찾지 못했습니다.', 'PARTICIPANT_NOT_FOUND')
  }
  const identityClause = target.user_id ? 'user_id = ?' : 'id = ?'
  const identity = target.user_id ?? target.id
  const participantQuery = `SELECT id FROM participants WHERE room_id = ? AND ${identityClause}`
  const participants = db.prepare(
    `SELECT id, nickname FROM participants WHERE room_id = ? AND ${identityClause} ORDER BY id`,
  ).all(room.id, identity)
  const songs = db.prepare(
    `SELECT id, status, started_at FROM songs
     WHERE room_id = ? AND added_by IN (${participantQuery}) ORDER BY id`,
  ).all(room.id, room.id, identity)
  const votes = db.prepare(
    `SELECT song_id, voter_participant_id, updated_at FROM song_votes
     WHERE room_id = ? AND (requester_participant_id IN (${participantQuery})
       OR voter_participant_id IN (${participantQuery})) ORDER BY song_id, voter_participant_id`,
  ).all(room.id, room.id, identity, room.id, identity)
  // Old manager events stored only a nickname. Resolve those only when the name
  // uniquely belongs to this target; newer events carry the participant ID.
  const feedQuery = `SELECT id, entry_type, sequence FROM room_feed_entries
    WHERE room_id = ? AND (
      participant_id IN (${participantQuery}) OR
      (entry_type = 'system' AND event_type IN ('manager_added', 'manager_removed') AND
        CASE WHEN json_valid(event_data) THEN
          json_extract(event_data, '$.targetParticipantId') IN (${participantQuery}) OR
          (json_extract(event_data, '$.targetParticipantId') IS NULL AND
           json_extract(event_data, '$.target') IN (
             SELECT nickname FROM participants WHERE room_id = ? AND ${identityClause}
             EXCEPT SELECT nickname FROM participants WHERE room_id = ? AND NOT (${identityClause})
           ))
        ELSE 0 END)
    ) ORDER BY id`
  const feedParams = [room.id, room.id, identity, room.id, identity, room.id, identity, room.id, identity]
  const feed = db.prepare(feedQuery).all(...feedParams)
  const revision = crypto.createHash('sha256').update(JSON.stringify({
    identity, participants, songs, votes, feed,
  })).digest('hex')
  const preview = {
    code: room.code, roomTitle: room.title,
    target: { participantId: target.id, nickname: target.nickname, userId: target.user_id, discordId: target.discord_id ?? null },
    counts: {
      participants: participants.length, songs: songs.length,
      queuedSongs: songs.filter(({ status }) => status === 'queued').length,
      currentSongs: songs.filter(({ status }) => status === 'current').length,
      playedSongs: songs.filter(({ status }) => status === 'played').length,
      plays: songs.filter(({ started_at }) => started_at !== null).length,
      votes: votes.length,
      messages: feed.filter(({ entry_type }) => entry_type === 'message').length,
      events: feed.filter(({ entry_type }) => entry_type === 'system').length,
    },
    revision,
  }
  return { room, preview, participants, participantQuery, identity, feedQuery, feedParams, votes }
}

// The room service calls this within the same transaction as timeline repair and audit.
function deleteRoomUserRecords(db, records) {
  const { room, participantQuery, identity, feedQuery, feedParams, votes } = records
  // Votes cast by the target on other requests change those requests' visible totals.
  const affectedSongIds = new Set(votes.map(({ song_id }) => song_id))
  const bumpVote = db.prepare('UPDATE songs SET vote_revision = vote_revision + 1 WHERE id = ? AND room_id = ?')
  for (const songId of affectedSongIds) bumpVote.run(songId, room.id)
  db.prepare(`DELETE FROM room_feed_entries WHERE id IN (SELECT id FROM (${feedQuery}))`).run(...feedParams)
  db.prepare(`DELETE FROM songs WHERE room_id = ? AND added_by IN (${participantQuery})`)
    .run(room.id, room.id, identity)
  // Cascades also remove access tokens and votes cast on other users' songs.
  db.prepare(`DELETE FROM participants WHERE room_id = ? AND ${records.preview.target.userId ? 'user_id = ?' : 'id = ?'}`)
    .run(room.id, identity)
  db.prepare('DELETE FROM room_autoplay_suggestions WHERE room_id = ?').run(room.id)
}

module.exports = { readRoomUserRecords, deleteRoomUserRecords }
