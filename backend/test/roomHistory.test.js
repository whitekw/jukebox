const test = require('node:test')
const assert = require('node:assert/strict')
const { createDatabase } = require('../src/db')
const { createRoomService } = require('../src/rooms')

function song(videoId) {
  return { videoId, title: `Title ${videoId}`, artist: 'Artist', durationSeconds: 180, thumbnailUrl: 'image' }
}

test('history searches all completed records before paging and combines search with requester filters', () => {
  const db = createDatabase()
  try {
    db.prepare(`INSERT INTO users (id, discord_id, username, created_at, updated_at, last_login_at)
      VALUES ('owner', 'discord-owner', 'Owner', 1, 1, 1)`).run()
    const rooms = createRoomService(db, { now: () => 1000 })
    const owner = rooms.createRoom({ ownerUserId: 'owner', nickname: 'Host' })
    const alice = rooms.joinRoom(owner.code, { nickname: 'Alice' })
    const bob = rooms.joinRoom(owner.code, { nickname: 'Bob' })
    const metadata = [
      ['바람과 비 · Needle', 'Artist', alice], ['Different title', 'Needle artist', bob],
      ['Another NEEDLE', 'Artist', alice], ['100%_mix', 'Artist', alice],
      ['Autoplay Needle', 'Artist', alice], ['Removed Needle', 'Artist', bob],
    ]
    const ids = []
    for (const [index, [title, artist, guest]] of metadata.entries()) {
      ids.push(rooms.addSong(owner.code, guest.participantToken, { ...song(`v${index}`), title, artist }).currentSong.id)
      rooms.advance(owner.code, { hostToken: owner.hostToken })
    }
    db.prepare('UPDATE songs SET is_autoplay = 1 WHERE id = ?').run(ids[4])
    db.prepare("UPDATE songs SET status = 'removed' WHERE id = ?").run(ids[5])
    rooms.addSong(owner.code, alice.participantToken, { ...song('current'), title: 'Current Needle' })
    const another = rooms.createRoom({ ownerUserId: 'owner', nickname: 'Other room' })
    rooms.addSong(another.code, another.participantToken, { ...song('other'), title: 'Other room Needle' })
    rooms.advance(another.code, { hostToken: another.hostToken })
    const credentials = { participantToken: alice.participantToken }
    const search = (query, before = null, requesterIds = [], limit = 1) =>
      rooms.getRoomHistory(owner.code, credentials, before, limit, requesterIds, query)
    const first = search('  needle  ')
    assert.deepEqual(first.items.map(({ id }) => id), [ids[4]])
    assert.equal(first.nextCursor, ids[4])
    const second = search('needle', first.nextCursor)
    assert.deepEqual(second.items.map(({ id }) => id), [ids[2]])
    const third = search('needle', second.nextCursor)
    assert.deepEqual(third.items.map(({ id }) => id), [ids[1]])
    const last = search('needle', third.nextCursor)
    assert.deepEqual(last.items.map(({ id }) => id), [ids[0]])
    assert.equal(last.nextCursor, null)
    assert.deepEqual(search('needle', null, [alice.participant.id], 10).items.map(({ id }) => id), [ids[2], ids[0]])
    assert.deepEqual(search('needle', null, [alice.participant.id, bob.participant.id], 10).items.map(({ id }) => id), [ids[2], ids[1], ids[0]])
    assert.deepEqual(search('바람').items.map(({ id }) => id), [ids[0]])
    assert.deepEqual(search('V2').items.map(({ id }) => id), [ids[2]])
    assert.deepEqual(search('%_').items.map(({ id }) => id), [ids[3]])
    assert.equal(search('no match').items.length, 0)
    assert.equal(search('no match').nextCursor, null)
    const all = search('  ', null, [], 50)
    assert.equal(all.items.length, 5)
    assert.deepEqual(search('no match').requesters, all.requesters)
    assert.deepEqual(all.requesters.map(({ nickname, plays }) => [nickname, plays]), [['Alice', 3], ['Bob', 1]])
    assert.throws(() => search('x'.repeat(101)), { code: 'INVALID_HISTORY_SEARCH' })
    assert.throws(() => search(['needle']), { code: 'INVALID_HISTORY_SEARCH' })
    assert.throws(() => rooms.getRoomHistory(owner.code, {}, null, 30, [], 'needle'), { code: 'PARTICIPANT_REQUIRED' })
  } finally {
    db.close()
  }
})

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

test('room history filters by participant identity across pages and excludes autoplay records', () => {
  const db = createDatabase()
  const clock = Date.parse('2026-10-01T00:00:00Z')
  try {
    const rooms = createRoomService(db, { now: () => clock })
    db.prepare(`INSERT INTO users (id, discord_id, username, created_at, updated_at, last_login_at)
      VALUES ('owner', 'discord-owner', 'Owner', 1, 1, 1)`).run()
    const owner = rooms.createRoom({ ownerUserId: 'owner', nickname: 'Host' })
    const firstGuest = rooms.joinRoom(owner.code, { nickname: 'Guest' })
    const secondGuest = rooms.joinRoom(owner.code, { nickname: 'Guest' })
    const plays = []
    for (const [index, guest] of [firstGuest, secondGuest, firstGuest, secondGuest].entries()) {
      const result = rooms.addSong(owner.code, guest.participantToken, song(`history-${index}`))
      plays.push(result.currentSong.id)
      rooms.advance(owner.code, { hostToken: owner.hostToken })
    }
    db.prepare('UPDATE songs SET is_autoplay = 1 WHERE id = ?').run(plays[3])
    const credentials = { participantToken: firstGuest.participantToken }
    const firstPage = rooms.getRoomHistory(owner.code, credentials, null, 1, firstGuest.participant.id)
    assert.deepEqual(firstPage.items.map(({ id }) => id), [plays[2]])
    assert.equal(firstPage.nextCursor, plays[2])
    assert.deepEqual(rooms.getRoomHistory(owner.code, credentials, firstPage.nextCursor, 1,
      firstGuest.participant.id).items.map(({ id }) => id), [plays[0]])
    assert.deepEqual(rooms.getRoomHistory(owner.code, credentials, null, 10,
      secondGuest.participant.id).items.map(({ id }) => id), [plays[1]])
    const combined = rooms.getRoomHistory(owner.code, credentials, null, 2,
      [firstGuest.participant.id, secondGuest.participant.id])
    assert.deepEqual(combined.items.map(({ id }) => id), [plays[2], plays[1]])
    assert.deepEqual(rooms.getRoomHistory(owner.code, credentials, combined.nextCursor, 2,
      [firstGuest.participant.id, secondGuest.participant.id]).items.map(({ id }) => id), [plays[0]])
    assert.deepEqual(firstPage.requesters.map(({ id }) => id).sort(),
      [firstGuest.participant.id, secondGuest.participant.id].sort())
    assert.ok(firstPage.requesters.every(({ nickname }) => nickname === 'Guest'))
    assert.throws(() => rooms.getRoomHistory(owner.code, credentials, null, 10, 'missing'),
      { code: 'INVALID_HISTORY_REQUESTER' })
    assert.throws(() => rooms.getRoomHistory(owner.code, credentials, null, 10,
      [firstGuest.participant.id, 'missing']), { code: 'INVALID_HISTORY_REQUESTER' })
  } finally {
    db.close()
  }
})
