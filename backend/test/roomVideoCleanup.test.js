const test = require('node:test')
const assert = require('node:assert/strict')
const { createDatabase } = require('../src/db')
const { createRoomService } = require('../src/rooms')
const { createAdminService } = require('../src/admin')

const operator = { id: 'operator', discordId: '123456789012345678' }
const track = (videoId, title = `Title ${videoId}`) => ({ videoId, title, artist: 'Artist', durationSeconds: 180, thumbnailUrl: 'image' })

function fixture(mode = 'host_only') {
  const db = createDatabase()
  db.prepare(`INSERT INTO users (id, discord_id, username, created_at, updated_at, last_login_at)
    VALUES ('owner', '234567890123456789', 'Owner', 1, 1, 1),
      ('operator', '123456789012345678', 'Operator', 1, 1, 1)`).run()
  let clock = Date.now()
  const rooms = createRoomService(db, { now: () => clock })
  const room = rooms.createRoom({ ownerUserId: 'owner', participantUserId: 'owner', nickname: 'Owner', playbackMode: mode })
  const listener = rooms.joinRoom(room.code, { nickname: 'Listener' })
  const roomId = db.prepare('SELECT id FROM rooms WHERE code = ?').get(room.code).id
  const first = rooms.addSong(room.code, room.participantToken, track('target-video'), 'owner').currentSong
  rooms.setSongVote(room.code, { participantToken: listener.participantToken }, first.id, 'up')
  rooms.advance(room.code, { userId: 'owner' })
  const automatic = rooms.addSong(room.code, listener.participantToken, track('target-video')).currentSong
  db.prepare('UPDATE songs SET is_autoplay = 1 WHERE id = ?').run(automatic.id)
  rooms.advance(room.code, { userId: 'owner' })
  const failed = rooms.addSong(room.code, listener.participantToken, track('target-video')).currentSong
  rooms.reportPlaybackFailure(room.code, { userId: 'owner', hostToken: room.hostToken }, { songId: failed.id, videoId: 'target-video', errorCode: 150 })
  const current = rooms.addSong(room.code, room.participantToken, track('target-video'), 'owner').currentSong
  rooms.setSongVote(room.code, { participantToken: listener.participantToken }, current.id, 'down')
  rooms.addSong(room.code, listener.participantToken, track('next-video'))
  rooms.addChatMessage(room.code, listener.participantToken, 'Title target-video')
  rooms.addRoomEvent(room.code, 'song_skipped', { userId: 'owner' }, { title: 'Title target-video' })
  rooms.addRoomEvent(room.code, 'song_removed', { userId: 'owner' }, { title: 'Older title', videoId: 'target-video' })
  rooms.addRoomEvent(room.code, 'queue_reordered', { userId: 'owner' }, { title: 'Older title', songId: current.id })
  rooms.addRoomEvent(room.code, 'song_added', { userId: 'owner' }, { title: 'Title next-video', videoId: 'next-video' })
  db.prepare('UPDATE rooms SET autoplay_excluded_video_ids = ? WHERE id = ?')
    .run(JSON.stringify(['target-video', 'excluded-only']), roomId)
  const secondRoom = rooms.createRoom({ ownerUserId: 'owner', participantUserId: 'owner', nickname: 'Owner' })
  rooms.addSong(secondRoom.code, secondRoom.participantToken, track('target-video'), 'owner')
  db.prepare(`INSERT INTO library_tracks (video_id, title, artist, duration_seconds, thumbnail_url, updated_at)
    VALUES ('target-video', 'Keep', 'Artist', 180, 'image', 1)`).run()
  db.prepare(`INSERT INTO playlists (id, owner_user_id, name, kind, created_at, updated_at)
    VALUES ('playlist', 'owner', 'Keep', 'custom', 1, 1)`).run()
  db.prepare(`INSERT INTO playlist_tracks (playlist_id, video_id, added_at) VALUES ('playlist', 'target-video', 1)`).run()
  const admin = createAdminService(db, { discordIds: operator.discordId, roomService: rooms })
  const preview = (videoId = 'target-video') => rooms.previewVideoRecordsAsAdmin(room.code, videoId)
  const remove = (videoId = 'target-video', confirmation = {}) => admin.deleteRoomVideoRecords(operator, room.code, videoId, {
    confirmationCode: room.code, revision: preview(videoId).revision, ...confirmation,
  })
  return { db, rooms, admin, room, roomId, listener, first, current, secondRoom, preview, remove, listen: () => { clock += 10_000 } }
}

for (const mode of ['host_only', 'all_devices']) {
  test(`video cleanup removes all requesters, autoplay and failures in one ${mode} room`, () => {
    const { db, rooms, admin, room, roomId, listener, secondRoom, preview, remove } = fixture(mode)
    try {
      assert.deepEqual(preview().counts, { songs: 4, plays: 3, queuedSongs: 0, currentSongs: 1, failedSongs: 1, votes: 2, events: 3, autoplayExclusions: 1 })
      const participantCount = db.prepare('SELECT COUNT(*) AS count FROM participants').get().count
      const result = remove()
      assert.equal(result.room.currentSong.videoId, 'next-video')
      assert.equal(result.room.playbackPending, mode === 'all_devices')
      assert.equal(result.room.playbackPaused, false)
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM songs WHERE room_id = ? AND video_id = ?').get(roomId, 'target-video').count, 0)
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM song_votes').get().count, 0)
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM participants').get().count, participantCount)
      assert.equal(rooms.getParticipantStatus(room.code, listener.participantToken).id, listener.participant.id)
      assert.deepEqual(rooms.getRoomHistory(room.code, { participantToken: listener.participantToken }).items, [])
      assert.equal(rooms.getRoomStats(room.code, { participantToken: listener.participantToken }).totalPlays, 1)
      const feed = rooms.listChatMessages(room.code, listener.participantToken)
      assert.equal(feed.length, 2)
      assert.ok(feed.some((entry) => entry.type === 'message' && entry.content === 'Title target-video'))
      assert.equal(rooms.getPublicRoom(secondRoom.code).currentSong.videoId, 'target-video')
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM playlist_tracks').get().count, 1)
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM library_tracks').get().count, 1)
      assert.deepEqual(JSON.parse(db.prepare('SELECT autoplay_excluded_video_ids FROM rooms WHERE id = ?').get(roomId).autoplay_excluded_video_ids), ['excluded-only'])
      assert.equal(admin.listRoomVideos(room.code, 'target-video').total, 0)
      assert.deepEqual(admin.listAudit().map(({ action, targetId }) => [action, targetId]), [['room_video_records_deleted', `${room.code}/target-video`]])
      assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
      // Clearing failed records also allows a fresh request for this video.
      rooms.addSong(room.code, listener.participantToken, track('target-video'))
      assert.equal(admin.listRoomVideos(room.code, 'target-video').total, 1)
    } finally { db.close() }
  })
}

test('preview rejects wrong confirmation, unauthorized operators and newly changed video records', () => {
  const { db, rooms, admin, room, listener, current, preview, remove } = fixture()
  try {
    assert.throws(() => admin.deleteRoomVideoRecords({ id: 'owner', discordId: '234567890123456789' }, room.code, 'target-video', {}), { code: 'ADMIN_FORBIDDEN' })
    assert.throws(() => remove('target-video', { confirmationCode: 'WRONG' }), { code: 'ROOM_RECORDS_CONFIRMATION_MISMATCH' })
    const before = preview()
    rooms.setSongVote(room.code, { participantToken: listener.participantToken }, current.id, 'up')
    assert.throws(() => remove('target-video', { revision: before.revision }), { code: 'ROOM_RECORDS_CHANGED' })
    const voted = preview()
    rooms.advance(room.code, { userId: 'owner' })
    rooms.addSong(room.code, listener.participantToken, track('target-video'))
    assert.throws(() => remove('target-video', { revision: voted.revision }), { code: 'ROOM_RECORDS_CHANGED' })
    assert.equal(admin.listAudit().length, 0)
    assert.throws(() => preview('missing'), { code: 'ROOM_VIDEO_NOT_FOUND' })
    assert.throws(() => rooms.previewVideoRecordsAsAdmin('missing', 'target-video'), { code: 'ROOM_NOT_FOUND' })
  } finally { db.close() }
})

test('clearing a queued and historical video preserves unrelated playback and votes', () => {
  const { db, rooms, room, listener, remove } = fixture()
  try {
    const next = rooms.advance(room.code, { userId: 'owner' }).currentSong
    rooms.setSongVote(room.code, { userId: 'owner' }, next.id, 'up')
    rooms.addSong(room.code, listener.participantToken, track('target-video'))
    rooms.setPlaybackPaused(room.code, { userId: 'owner' }, true)
    const result = remove()
    assert.equal(result.counts.currentSongs, 0)
    assert.equal(result.counts.queuedSongs, 1)
    assert.equal(result.room.currentSong.id, next.id)
    assert.equal(result.room.playbackPaused, true)
    assert.deepEqual(result.room.queue, [])
    assert.equal(db.prepare('SELECT song_id FROM song_votes').get().song_id, next.id)
  } finally { db.close() }
})

test('audit failure rolls back video, votes, activity, exclusions and the playback timeline', () => {
  const { db, rooms, room, current, preview, remove } = fixture()
  try {
    const before = preview()
    db.exec(`CREATE TRIGGER reject_video_cleanup_audit BEFORE INSERT ON admin_audit_entries
      BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END`)
    assert.throws(() => remove(), /audit unavailable/)
    assert.deepEqual(preview(), before)
    assert.equal(rooms.getPublicRoom(room.code).currentSong.id, current.id)
  } finally { db.close() }
})

test('ambiguous legacy titles and explicitly unrelated activities are preserved', () => {
  const { db, rooms, room, listener, preview, remove } = fixture()
  try {
    rooms.addSong(room.code, listener.participantToken, track('different-video', 'Title target-video'))
    rooms.addRoomEvent(room.code, 'song_added', { userId: 'owner' }, { title: 'Title target-video', videoId: 'different-video' })
    assert.equal(preview().counts.events, 2)
    remove()
    const feed = rooms.listChatMessages(room.code, listener.participantToken)
    assert.equal(feed.length, 4)
    assert.ok(feed.some((entry) => entry.eventType === 'song_skipped'))
  } finally { db.close() }
})

test('lists unique videos with searchable pagination, including exclusion-only records', () => {
  const { db, rooms, admin, room, listener, remove } = fixture()
  try {
    for (let index = 0; index < 25; index += 1) rooms.addSong(room.code, listener.participantToken, track(`older-${index}`))
    const videos = admin.listRoomVideos(room.code, '', 2)
    assert.equal(videos.total, 28)
    assert.equal(videos.page, 2)
    assert.equal(videos.items.length, 8)
    assert.equal(admin.listRoomVideos(room.code, 'target-video').items[0].songs, 4)
    assert.equal(admin.listRoomVideos(room.code, 'Artist').total, 27)
    assert.equal(admin.listRoomVideos(room.code, 'excluded-only').items[0].autoplayExcluded, true)
    const result = remove('excluded-only')
    assert.equal(result.counts.songs, 0)
    assert.equal(result.counts.autoplayExclusions, 1)
    assert.equal(admin.listRoomVideos(room.code, 'excluded-only').total, 0)
    assert.equal(result.room.currentSong.videoId, 'target-video')
  } finally { db.close() }
})

test('can remove a video whose only remaining room information is an activity entry', () => {
  const { db, rooms, admin, room, remove } = fixture()
  try {
    rooms.addRoomEvent(room.code, 'song_removed', { userId: 'owner' }, { videoId: 'orphan-video', title: 'Orphan video' })
    assert.equal(admin.listRoomVideos(room.code, 'orphan-video').items[0].title, 'Orphan video')
    const result = remove('orphan-video')
    assert.equal(result.counts.songs, 0)
    assert.equal(result.counts.events, 1)
    assert.equal(admin.listRoomVideos(room.code, 'orphan-video').total, 0)
    assert.equal(result.room.currentSong.videoId, 'target-video')
  } finally { db.close() }
})

test('rebuilds the autoplay pool and empties current playback if no eligible video remains', () => {
  const { db, rooms, room, roomId, remove, listen } = fixture()
  try {
    rooms.advance(room.code, { userId: 'owner' })
    rooms.advance(room.code, { userId: 'owner' })
    // Keep ten eligible records after deletion so autoplay can replace a removed current song.
    for (let index = 0; index < 11; index += 1) {
      rooms.addSong(room.code, room.participantToken, track(`history-${index}`), 'owner')
      listen()
      rooms.advance(room.code, { userId: 'owner' })
    }
    rooms.updateRoomSettings(room.code, { userId: 'owner' }, { historyAutoplay: true })
    assert.ok(rooms.getPublicRoom(room.code).autoplaySuggestions.length > 0)
    const result = remove('history-0')
    assert.equal(result.room.autoplayHistoryCount, 10)
    assert.ok(result.room.currentSong)
    assert.notEqual(result.room.currentSong.videoId, 'history-0')
    assert.ok(result.room.autoplaySuggestions.length > 0)
    assert.ok(result.room.autoplaySuggestions.every(({ videoId }) => videoId !== 'history-0'))
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM room_autoplay_suggestions WHERE room_id = ? AND video_id = ?').get(roomId, 'history-0').count, 0)
    rooms.updateRoomSettings(room.code, { userId: 'owner' }, { historyAutoplay: false })
    rooms.advance(room.code, { userId: 'owner' })
    rooms.addSong(room.code, room.participantToken, track('last-video'), 'owner')
    assert.equal(remove('last-video').room.currentSong, null)
  } finally { db.close() }
})

test('deleting the current autoplay video empties playback when history falls below ten plays', () => {
  const { db, rooms, room, roomId, remove, listen } = fixture()
  try {
    rooms.advance(room.code, { userId: 'owner' })
    rooms.advance(room.code, { userId: 'owner' })
    for (let index = 0; index < 10; index += 1) {
      rooms.addSong(room.code, room.participantToken, track(`history-${index}`), 'owner')
      listen()
      rooms.advance(room.code, { userId: 'owner' })
    }
    const playing = rooms.updateRoomSettings(room.code, { userId: 'owner' }, { historyAutoplay: true })
    assert.equal(playing.autoplayHistoryCount, 10)
    assert.equal(playing.currentSong.isAutoplay, true)
    assert.match(playing.currentSong.videoId, /^history-\d+$/)
    const result = remove(playing.currentSong.videoId)
    assert.equal(result.room.autoplayHistoryCount, 9)
    assert.equal(result.room.currentSong, null)
    assert.deepEqual(result.room.autoplaySuggestions, [])
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM room_autoplay_suggestions WHERE room_id = ?').get(roomId).count, 0)
  } finally { db.close() }
})
