const test = require('node:test')
const assert = require('node:assert/strict')
const { createDatabase } = require('../src/db')
const { createRoomService } = require('../src/rooms')
const { createAdminService } = require('../src/admin')

const operator = { id: 'operator', discordId: '123456789012345678' }
const song = (videoId) => ({ videoId, title: videoId, artist: 'Artist', durationSeconds: 180, thumbnailUrl: 'image' })

function fixture(playbackMode = 'host_only') {
  const db = createDatabase()
  db.prepare(`INSERT INTO users (id, discord_id, username, created_at, updated_at, last_login_at)
    VALUES ('owner', '234567890123456789', 'Owner', 1, 1, 1),
      ('dummy', '345678901234567890', 'Dummy', 1, 1, 1),
      ('operator', '123456789012345678', 'Operator', 1, 1, 1)`).run()
  let clock = Date.now()
  const rooms = createRoomService(db, { now: () => clock })
  const room = rooms.createRoom({ ownerUserId: 'owner', participantUserId: 'owner', nickname: 'Owner', playbackMode })
  const listen = () => {
    const state = rooms.getPublicRoom(room.code)
    if (state.playbackPending) rooms.startPlayback(room.code, { userId: 'owner' }, state.currentSong.videoId, 0)
    clock += 10_000
  }
  const oldDummy = rooms.joinRoom(room.code, { userId: 'dummy', nickname: 'Test user' })
  rooms.addSong(room.code, oldDummy.participantToken, song('dummy-played'), 'dummy')
  rooms.addChatMessage(room.code, oldDummy.participantToken, 'dummy old chat', 'dummy')
  rooms.addRoomEvent(room.code, 'song_added', { userId: 'dummy' }, { title: 'dummy-played' })
  listen()
  rooms.advance(room.code, { userId: 'owner' })
  rooms.leaveAccountRoom(room.code, 'dummy')
  const dummy = rooms.joinRoom(room.code, { userId: 'dummy', nickname: 'Test user' })
  const other = rooms.joinRoom(room.code, { nickname: 'Real listener' })
  const otherSong = rooms.addSong(room.code, other.participantToken, song('other-played')).currentSong
  rooms.setSongVote(room.code, { userId: 'dummy' }, otherSong.id, 'up')
  listen()
  rooms.advance(room.code, { userId: 'owner' })
  const current = rooms.addSong(room.code, dummy.participantToken, song('dummy-current'), 'dummy').currentSong
  rooms.setSongVote(room.code, { userId: 'owner' }, current.id, 'down')
  rooms.addSong(room.code, dummy.participantToken, song('dummy-queued'), 'dummy')
  rooms.addSong(room.code, other.participantToken, song('real-next'))
  rooms.addChatMessage(room.code, dummy.participantToken, 'dummy new chat', 'dummy')
  rooms.addChatMessage(room.code, other.participantToken, 'real chat')
  rooms.addRoomEvent(room.code, 'manager_added', { userId: 'owner' }, { target: 'Test user', targetParticipantId: dummy.participant.id })
  rooms.addRoomEvent(room.code, 'manager_removed', { userId: 'owner' }, { target: 'Test user' })
  rooms.addRoomEvent(room.code, 'song_added', { participantToken: other.participantToken }, { title: 'real-next' })
  const secondRoom = rooms.createRoom({ ownerUserId: 'dummy', participantUserId: 'dummy', nickname: 'Other room test' })
  rooms.addSong(secondRoom.code, secondRoom.participantToken, song('other-room'), 'dummy')
  db.prepare(`INSERT INTO auth_sessions (id, user_id, token_hash, created_at, expires_at)
    VALUES ('dummy-auth', 'dummy', 'dummy-auth-hash', 1, 9999999999999)`).run()
  db.prepare(`INSERT INTO playlists (id, owner_user_id, name, kind, created_at, updated_at)
    VALUES ('dummy-playlist', 'dummy', 'Keep me', 'custom', 1, 1)`).run()
  const admin = createAdminService(db, { discordIds: operator.discordId, roomService: rooms })
  const preview = () => rooms.previewUserRecordsAsAdmin(room.code, dummy.participant.id)
  const remove = (confirmation = {}) => {
    const currentPreview = preview()
    return admin.deleteRoomUserRecords(operator, room.code, dummy.participant.id, {
      confirmationCode: room.code, revision: currentPreview.revision, ...confirmation,
    })
  }
  return { db, rooms, admin, room, dummy, oldDummy, other, current, otherSong, secondRoom, preview, remove, listen }
}

for (const mode of ['host_only', 'all_devices']) {
  test(`deletes every account occurrence within one ${mode} room and repairs playback, votes and stats`, () => {
    const { db, rooms, admin, room, dummy, oldDummy, other, current, otherSong, secondRoom, preview, remove } = fixture(mode)
    try {
      const before = preview()
      assert.deepEqual(before.counts, {
        participants: 2, songs: 3, queuedSongs: 1, currentSongs: 1, playedSongs: 1,
        plays: 2, votes: 2, messages: 2, events: 3,
      })
      const voteRevision = db.prepare('SELECT vote_revision FROM songs WHERE id = ?').get(otherSong.id).vote_revision
      const result = remove()
      assert.deepEqual(new Set(result.participantIds), new Set([dummy.participant.id, oldDummy.participant.id]))
      assert.equal(result.room.currentSong.videoId, 'real-next')
      assert.equal(result.room.playbackPending, mode === 'all_devices')
      assert.equal(result.room.playbackPaused, false)
      assert.deepEqual(result.room.queue, [])
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM songs WHERE id = ?').get(current.id).count, 0)
      assert.equal(db.prepare('SELECT vote_revision FROM songs WHERE id = ?').get(otherSong.id).vote_revision, voteRevision + 1)
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM song_votes').get().count, 0)
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM participants WHERE room_id = (SELECT id FROM rooms WHERE code = ?) AND user_id = ?')
        .get(room.code, 'dummy').count, 0)
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM participant_access_tokens WHERE participant_id IN (?, ?)')
        .get(dummy.participant.id, oldDummy.participant.id).count, 0)
      const history = rooms.getRoomHistory(room.code, { participantToken: other.participantToken })
      assert.deepEqual(history.items.map(({ videoId }) => videoId), ['other-played'])
      const stats = rooms.getRoomStats(room.code, { participantToken: other.participantToken })
      assert.equal(stats.totalPlays, 2)
      assert.equal(stats.totalUpvotes, 0)
      assert.equal(stats.totalDownvotes, 0)
      assert.ok(stats.participants.every(({ nickname }) => nickname !== 'Test user'))
      const feed = rooms.listChatMessages(room.code, other.participantToken)
      assert.equal(feed.length, 2)
      assert.ok(feed.every(({ nickname }) => nickname === 'Real listener'))
      assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0)
      assert.equal(rooms.getPublicRoom(secondRoom.code).currentSong.videoId, 'other-room')
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM users WHERE id = 'dummy'").get().count, 1)
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM playlists WHERE id = 'dummy-playlist'").get().count, 1)
      assert.equal(db.prepare("SELECT COUNT(*) AS count FROM auth_sessions WHERE id = 'dummy-auth'").get().count, 1)
      assert.deepEqual(admin.listAudit().map(({ action, targetId }) => [action, targetId]), [['room_user_records_deleted', `${room.code}/dummy`]])
      assert.throws(() => rooms.getParticipantStatus(room.code, dummy.participantToken, 'dummy'), { code: 'PARTICIPANT_REQUIRED' })
    } finally { db.close() }
  })
}

test('requires operator rights, exact room confirmation and an unchanged preview', () => {
  const { db, rooms, admin, room, dummy, preview, remove } = fixture()
  try {
    const before = preview()
    assert.throws(() => admin.deleteRoomUserRecords({ id: 'dummy', discordId: '345678901234567890' }, room.code, dummy.participant.id, {}), { code: 'ADMIN_FORBIDDEN' })
    assert.throws(() => remove({ confirmationCode: 'WRONG' }), { code: 'ROOM_RECORDS_CONFIRMATION_MISMATCH' })
    rooms.addChatMessage(room.code, dummy.participantToken, 'new activity', 'dummy')
    assert.throws(() => remove({ revision: before.revision }), { code: 'ROOM_RECORDS_CHANGED' })
    assert.equal(preview().counts.messages, 3)
    assert.equal(admin.listAudit().length, 0)
    assert.throws(() => rooms.previewUserRecordsAsAdmin(room.code, 'missing'), { code: 'PARTICIPANT_NOT_FOUND' })
  } finally { db.close() }
})

test('rolls the entire cleanup and timeline back if its audit entry cannot be saved', () => {
  const { db, rooms, room, current, preview, remove } = fixture()
  try {
    const before = preview()
    db.exec(`CREATE TRIGGER reject_record_cleanup_audit BEFORE INSERT ON admin_audit_entries
      BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END`)
    assert.throws(() => remove(), /audit unavailable/)
    assert.deepEqual(preview(), before)
    assert.equal(rooms.getPublicRoom(room.code).currentSong.id, current.id)
  } finally { db.close() }
})

test('deleting a guest occurrence preserves another guest with the same nickname and the current song', () => {
  const { db, rooms, admin, room, other, current } = fixture()
  try {
    const guestA = rooms.joinRoom(room.code, { nickname: 'Same name' })
    const guestB = rooms.joinRoom(room.code, { nickname: 'Same name' })
    rooms.addChatMessage(room.code, guestA.participantToken, 'delete')
    rooms.addChatMessage(room.code, guestB.participantToken, 'keep')
    rooms.addRoomEvent(room.code, 'manager_removed', { participantToken: other.participantToken }, { target: 'Same name' })
    const preview = rooms.previewUserRecordsAsAdmin(room.code, guestA.participant.id)
    const result = admin.deleteRoomUserRecords(operator, room.code, guestA.participant.id, { confirmationCode: room.code, revision: preview.revision })
    assert.equal(result.counts.participants, 1)
    assert.equal(result.room.currentSong.id, current.id)
    assert.equal(rooms.getParticipantStatus(room.code, guestB.participantToken).id, guestB.participant.id)
    assert.ok(rooms.listChatMessages(room.code, guestB.participantToken).some(({ content }) => content === 'keep'))
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM room_feed_entries WHERE event_type = 'manager_removed' AND event_data LIKE '%Same name%'").get().count, 1)
  } finally { db.close() }
})

test('rebuilds autoplay suggestions from surviving history and keeps room ownership', () => {
  const { db, rooms, admin, room, dummy, listen } = fixture()
  try {
    listen()
    rooms.advance(room.code, { userId: 'owner' })
    listen()
    rooms.advance(room.code, { userId: 'owner' })
    listen()
    rooms.advance(room.code, { userId: 'owner' })
    for (let index = 0; index < 10; index += 1) {
      rooms.addSong(room.code, room.participantToken, song(`owner-history-${index}`), 'owner')
      listen()
      rooms.advance(room.code, { userId: 'owner' })
    }
    rooms.updateRoomSettings(room.code, { userId: 'owner' }, { historyAutoplay: true })
    const before = rooms.previewUserRecordsAsAdmin(room.code, dummy.participant.id)
    const result = admin.deleteRoomUserRecords(operator, room.code, dummy.participant.id, { confirmationCode: room.code, revision: before.revision })
    assert.ok(result.room.autoplaySuggestions.every(({ videoId }) => !videoId.startsWith('dummy-')))
    const ownerId = db.prepare('SELECT id FROM participants WHERE room_id = (SELECT id FROM rooms WHERE code = ?) AND user_id = ?').get(room.code, 'owner').id
    const ownerPreview = rooms.previewUserRecordsAsAdmin(room.code, ownerId)
    const removedOwner = admin.deleteRoomUserRecords(operator, room.code, ownerId, { confirmationCode: room.code, revision: ownerPreview.revision })
    assert.equal(removedOwner.room.autoplayHistoryCount, 2)
    assert.deepEqual(removedOwner.room.autoplaySuggestions, [])
    assert.equal(db.prepare('SELECT owner_user_id FROM rooms WHERE code = ?').get(room.code).owner_user_id, 'owner')
  } finally { db.close() }
})

test('participant searches find older departed users beyond the latest hundred rows', () => {
  const { db, rooms, admin, room, dummy } = fixture()
  try {
    for (let index = 0; index < 110; index += 1) rooms.joinRoom(room.code, { nickname: `Guest ${index}` })
    const found = admin.listRoomParticipants(room.code, '345678901234567890', 1)
    assert.equal(found.total, 2)
    assert.ok(found.items.some(({ id }) => id === dummy.participant.id))
    assert.equal(admin.listRoomParticipants(room.code, 'Guest', 2).items.length, 20)
    assert.equal(admin.listRoomParticipants(room.code, 'Guest', 2).page, 2)
  } finally { db.close() }
})
