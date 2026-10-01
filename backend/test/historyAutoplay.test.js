const test = require('node:test')
const assert = require('node:assert/strict')
const { createDatabase } = require('../src/db')
const { createRoomService } = require('../src/rooms')

function song(index, durationSeconds = 180) {
  return {
    videoId: `video-${index}`,
    title: `Song ${index}`,
    artist: 'Artist',
    durationSeconds,
    thumbnailUrl: `image-${index}`,
  }
}

test('history autoplay needs ten manual plays, yields to requests and creates separate records', () => {
  const db = createDatabase()
  try {
    db.prepare(`INSERT INTO users (id, discord_id, username, created_at, updated_at, last_login_at)
      VALUES ('owner', 'discord-owner', 'Owner', 1, 1, 1),
             ('requester', 'discord-requester', 'Requester', 1, 1, 1)`).run()
    const rooms = createRoomService(db)
    const created = rooms.createRoom({ ownerUserId: 'owner', nickname: 'Owner' })
    const requester = rooms.joinRoom(created.code, { nickname: 'Requester', userId: 'requester' })
    const credentials = { userId: 'owner' }

    for (let index = 0; index < 9; index += 1) {
      rooms.addSong(created.code, requester.participantToken, song(index), 'requester')
      rooms.advance(created.code, { hostToken: created.hostToken })
    }
    assert.equal(rooms.getPublicRoom(created.code).autoplayHistoryCount, 9)
    assert.throws(() => rooms.updateRoomSettings(created.code, credentials, { historyAutoplay: true }),
      { code: 'AUTOPLAY_HISTORY_REQUIRED' })
    assert.throws(() => rooms.updateRoomSettings(created.code,
      { participantToken: requester.participantToken }, { historyAutoplay: true }),
    { code: 'OWNER_FORBIDDEN' })

    rooms.addSong(created.code, requester.participantToken, song(9, 601), 'requester')
    rooms.advance(created.code, { hostToken: created.hostToken })
    const enabled = rooms.updateRoomSettings(created.code, credentials, { historyAutoplay: true })
    assert.equal(enabled.autoplayHistoryCount, 10)
    assert.equal(enabled.historyAutoplay, true)
    assert.equal(enabled.currentSong.isAutoplay, true)
    assert.ok(enabled.currentSong.durationSeconds <= 600)
    assert.equal(enabled.autoplaySuggestions.length, 8)
    assert.equal(new Set(enabled.autoplaySuggestions.map(({ videoId }) => videoId)).size,
      enabled.autoplaySuggestions.length)
    assert.ok(enabled.autoplaySuggestions.every(({ durationSeconds }) => durationSeconds <= 600))
    assert.ok(enabled.autoplaySuggestions.every(({ videoId }) => videoId !== 'video-9'))
    assert.deepEqual(createRoomService(db).getPublicRoom(created.code).autoplaySuggestions,
      enabled.autoplaySuggestions)
    assert.equal(enabled.participants.some(({ nickname }) => nickname === '자동 재생'), false)

    const roomId = db.prepare('SELECT id FROM rooms WHERE code = ?').get(created.code).id
    const duplicate = enabled.autoplaySuggestions[0]
    db.prepare(`INSERT INTO room_autoplay_suggestions
      (id, room_id, position, video_id, title, artist, duration_seconds, thumbnail_url)
      VALUES ('stale-duplicate', ?, 1000, ?, ?, ?, ?, ?)`).run(
      roomId, duplicate.videoId, duplicate.title, duplicate.artist,
      duplicate.durationSeconds, duplicate.thumbnailUrl,
    )
    assert.deepEqual(rooms.getPublicRoom(created.code).autoplaySuggestions,
      enabled.autoplaySuggestions)
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM room_autoplay_suggestions WHERE id = 'stale-duplicate'").get().count, 0)

    const firstAutoplayId = enabled.currentSong.id
    const manual = rooms.addSong(created.code, requester.participantToken, song(10), 'requester')
    assert.equal(manual.queue[0].videoId, 'video-10')
    const next = rooms.advance(created.code, { hostToken: created.hostToken })
    assert.equal(next.currentSong.videoId, 'video-10')
    assert.equal(next.currentSong.isAutoplay, false)
    assert.equal(next.autoplayHistoryCount, 10)
    assert.deepEqual(next.autoplaySuggestions.slice(0, manual.autoplaySuggestions.length),
      manual.autoplaySuggestions)
    const afterManual = rooms.advance(created.code, { hostToken: created.hostToken })
    assert.equal(afterManual.currentSong.isAutoplay, true)
    assert.notEqual(afterManual.currentSong.id, firstAutoplayId)
    assert.equal(afterManual.currentSong.videoId, next.autoplaySuggestions[0].videoId)
    assert.ok(afterManual.autoplaySuggestions.length <= 20)
    assert.deepEqual(afterManual.autoplaySuggestions.slice(0, next.autoplaySuggestions.length - 1),
      next.autoplaySuggestions.slice(1))
    assert.equal(new Set(afterManual.autoplaySuggestions.map(({ videoId }) => videoId)).size,
      afterManual.autoplaySuggestions.length)

    const requesterCredentials = { participantToken: requester.participantToken, userId: 'requester' }
    assert.equal(rooms.getSongVote(created.code, requesterCredentials, afterManual.currentSong.id).canVote, true)
    rooms.setSongVote(created.code, requesterCredentials, afterManual.currentSong.id, 'up')
    const stats = rooms.getRoomStats(created.code, requesterCredentials)
    assert.equal(stats.totalPlays, 13)
    assert.equal(stats.totalUpvotes, 1)
    assert.equal(stats.participants.find(({ nickname }) => nickname === 'Requester').plays, 11)
    assert.equal(stats.participants.find(({ nickname }) => nickname === 'Requester').upvotes, 0)
    const history = rooms.getRoomHistory(created.code, requesterCredentials)
    assert.equal(history.items.find(({ id }) => id === firstAutoplayId).isAutoplay, true)
    assert.equal(history.items.find(({ id }) => id === firstAutoplayId).requester, '자동 재생')

    rooms.updateRoomSettings(created.code, credentials, { historyAutoplay: false })
    const stopped = rooms.advance(created.code, { hostToken: created.hostToken })
    assert.equal(stopped.currentSong, null)
    assert.deepEqual(stopped.autoplaySuggestions, [])
  } finally {
    db.close()
  }
})

test('autoplay previews at most twenty distinct videos and drops a newly queued video', () => {
  const db = createDatabase()
  try {
    db.prepare(`INSERT INTO users (id, discord_id, username, created_at, updated_at, last_login_at)
      VALUES ('owner', 'discord-owner', 'Owner', 1, 1, 1)`).run()
    const rooms = createRoomService(db)
    const created = rooms.createRoom({ ownerUserId: 'owner', nickname: 'Owner' })
    for (let index = 0; index < 22; index += 1) {
      rooms.addSong(created.code, created.participantToken, song(index), 'owner')
      rooms.advance(created.code, { hostToken: created.hostToken })
    }
    const enabled = rooms.updateRoomSettings(created.code, { userId: 'owner' }, { historyAutoplay: true })
    assert.equal(enabled.autoplaySuggestions.length, 20)
    assert.equal(new Set(enabled.autoplaySuggestions.map(({ videoId }) => videoId)).size, 20)

    const queuedVideoId = enabled.autoplaySuggestions[5].videoId
    const queued = rooms.addSong(created.code, created.participantToken,
      { ...song(100), videoId: queuedVideoId }, 'owner')
    assert.equal(queued.queue[0].videoId, queuedVideoId)
    assert.equal(queued.autoplaySuggestions.length, 20)
    assert.ok(queued.autoplaySuggestions.every(({ videoId }) => videoId !== queuedVideoId))
    assert.equal(new Set(queued.autoplaySuggestions.map(({ videoId }) => videoId)).size, 20)
  } finally {
    db.close()
  }
})

test('controllers can redraw autoplay suggestions without changing the current song or requested queue', () => {
  const db = createDatabase()
  try {
    db.prepare(`INSERT INTO users (id, discord_id, username, created_at, updated_at, last_login_at)
      VALUES ('owner', 'discord-owner', 'Owner', 1, 1, 1)`).run()
    const rooms = createRoomService(db)
    const created = rooms.createRoom({ ownerUserId: 'owner', nickname: 'Owner' })
    const credentials = { userId: 'owner' }
    assert.throws(() => rooms.refreshAutoplaySuggestions(created.code, credentials),
      { code: 'HISTORY_AUTOPLAY_DISABLED' })
    for (let index = 0; index < 12; index += 1) {
      rooms.addSong(created.code, created.participantToken, song(index), 'owner')
      rooms.advance(created.code, { hostToken: created.hostToken })
    }
    const enabled = rooms.updateRoomSettings(created.code, credentials, { historyAutoplay: true })
    const queued = rooms.addSong(created.code, created.participantToken, song(99), 'owner')
    assert.throws(() => rooms.refreshAutoplaySuggestions(created.code, {}),
      { code: 'CONTROL_FORBIDDEN' })

    const refreshed = rooms.refreshAutoplaySuggestions(created.code, credentials)
    assert.equal(refreshed.currentSong.id, enabled.currentSong.id)
    assert.equal(refreshed.playbackRevision, queued.playbackRevision)
    assert.deepEqual(refreshed.queue, queued.queue)
    assert.notEqual(refreshed.autoplaySuggestions[0].videoId, queued.autoplaySuggestions[0].videoId)
    assert.equal(new Set(refreshed.autoplaySuggestions.map(({ videoId }) => videoId)).size,
      refreshed.autoplaySuggestions.length)
    assert.ok(refreshed.autoplaySuggestions.every(({ videoId }) => videoId !== 'video-99'))
    assert.deepEqual(createRoomService(db).getPublicRoom(created.code).autoplaySuggestions,
      refreshed.autoplaySuggestions)
  } finally {
    db.close()
  }
})
