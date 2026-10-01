const test = require('node:test')
const assert = require('node:assert/strict')
const { createDatabase } = require('../src/db')
const { createRoomService } = require('../src/rooms')

function song(videoId) {
  return { videoId, title: `Title ${videoId}`, artist: 'Artist', durationSeconds: 180, thumbnailUrl: 'image' }
}

test('room history keeps each played request and pages equal-time starts without repetition', () => {
  const db = createDatabase()
  const clock = Date.parse('2026-10-01T00:00:00Z')
  try {
    const rooms = createRoomService(db, { now: () => clock })
    db.prepare(`INSERT INTO users (id, discord_id, username, created_at, updated_at, last_login_at)
      VALUES ('owner', 'discord-owner', 'Owner', 1, 1, 1)`).run()
    const owner = rooms.createRoom({ ownerUserId: 'owner', nickname: 'Host' })
    const guest = rooms.joinRoom(owner.code, { nickname: 'Guest' })
    db.prepare('UPDATE participants SET avatar_url = ? WHERE id = ?')
      .run('https://example.com/guest.png', guest.participant.id)
    const first = rooms.addSong(owner.code, guest.participantToken, song('repeat'))
    const firstId = first.currentSong.id
    rooms.addSong(owner.code, guest.participantToken, song('other'))
    const secondId = rooms.advance(owner.code, { hostToken: owner.hostToken }).currentSong.id
    rooms.addSong(owner.code, guest.participantToken, song('repeat'))
    rooms.addSong(owner.code, guest.participantToken, song('still-queued'))
    const thirdId = rooms.advance(owner.code, { hostToken: owner.hostToken }).currentSong.id
    rooms.advance(owner.code, { hostToken: owner.hostToken })

    const credentials = { participantToken: guest.participantToken }
    const firstPage = rooms.getRoomHistory(owner.code, credentials, null, 2)
    assert.deepEqual(firstPage.items.map(({ id }) => id), [thirdId, secondId])
    assert.equal(firstPage.items[0].videoId, 'repeat')
    assert.equal(firstPage.items[0].title, 'Title repeat')
    assert.equal(firstPage.items[0].requester, 'Guest')
    assert.equal(firstPage.items[0].requesterAvatarUrl, 'https://example.com/guest.png')
    assert.equal(firstPage.items[0].startedAt, clock)
    assert.equal(firstPage.items[0].startedAtEstimated, false)
    assert.equal(firstPage.nextCursor, secondId)
    const lastPage = rooms.getRoomHistory(owner.code, credentials, firstPage.nextCursor, 2)
    assert.deepEqual(lastPage.items.map(({ id }) => id), [firstId])
    assert.equal(lastPage.nextCursor, null)
    assert.equal(lastPage.items[0].videoId, firstPage.items[0].videoId)
    assert.throws(() => rooms.getRoomHistory(owner.code, {}), { code: 'PARTICIPANT_REQUIRED' })
    assert.throws(() => rooms.getRoomHistory(owner.code, credentials, 'bad-id'), { code: 'INVALID_HISTORY_CURSOR' })
    assert.throws(() => rooms.getRoomHistory(owner.code, credentials, null, 0), { code: 'INVALID_HISTORY_LIMIT' })
  } finally {
    db.close()
  }
})
