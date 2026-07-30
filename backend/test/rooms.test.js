const test = require('node:test')
const assert = require('node:assert/strict')
const { createDatabase } = require('../src/db')
const { createRoomService } = require('../src/rooms')

function song(videoId, title) {
  return {
    videoId,
    title,
    artist: 'Test Artist',
    durationSeconds: 180,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
  }
}

test('creates, joins, queues and advances a room', () => {
  const db = createDatabase()
  const rooms = createRoomService(db, { roomTtlHours: 1 })
  const created = rooms.createRoom({ maxSongsPerParticipant: 2 })
  const alice = rooms.joinRoom(created.code, { nickname: 'Alice' })
  const bob = rooms.joinRoom(created.code, { nickname: 'Bob' })

  rooms.addSong(created.code, alice.participantToken, song('aaaaaaaaaaa', 'One'))
  const queued = rooms.addSong(
    created.code,
    bob.participantToken,
    song('bbbbbbbbbbb', 'Two'),
  )
  assert.equal(queued.currentSong.title, 'One')
  assert.equal(queued.queue[0].title, 'Two')

  const advanced = rooms.advance(created.code, created.hostToken)
  assert.equal(advanced.currentSong.title, 'Two')
  assert.equal(advanced.queue.length, 0)
  db.close()
})

test('enforces participant cap, duplicate prevention and host token', () => {
  const db = createDatabase()
  const rooms = createRoomService(db)
  const created = rooms.createRoom({ maxSongsPerParticipant: 1 })
  const alice = rooms.joinRoom(created.code, { nickname: 'Alice' })
  rooms.addSong(created.code, alice.participantToken, song('aaaaaaaaaaa', 'One'))

  assert.throws(
    () => rooms.addSong(created.code, alice.participantToken, song('bbbbbbbbbbb', 'Two')),
    /최대 1곡/,
  )
  assert.throws(() => rooms.advance(created.code, 'wrong-token'), /호스트 권한/)
  db.close()
})

test('assigns, transfers and enforces participant manager controls', () => {
  const db = createDatabase()
  const rooms = createRoomService(db)
  const created = rooms.createRoom({ maxSongsPerParticipant: 2 })
  const alice = rooms.joinRoom(created.code, { nickname: 'Alice' })
  const bob = rooms.joinRoom(created.code, { nickname: 'Bob' })

  let state = rooms.getPublicRoom(created.code)
  assert.equal(state.managerParticipantId, alice.participant.id)
  assert.equal(state.hostVolume, 100)
  assert.deepEqual(
    state.participants.map(({ nickname, isManager }) => ({ nickname, isManager })),
    [
      { nickname: 'Alice', isManager: true },
      { nickname: 'Bob', isManager: false },
    ],
  )
  assert.equal(
    rooms.getParticipantStatus(created.code, alice.participantToken).isManager,
    true,
  )

  rooms.addSong(created.code, alice.participantToken, song('aaaaaaaaaaa', 'One'))
  rooms.addSong(created.code, bob.participantToken, song('bbbbbbbbbbb', 'Two'))
  assert.throws(
    () =>
      rooms.advance(created.code, {
        participantToken: bob.participantToken,
      }),
    /관리 권한/,
  )

  state = rooms.updateRoomSettings(
    created.code,
    { participantToken: alice.participantToken },
    { maxSongsPerParticipant: 4, hostVolume: 35 },
  )
  assert.equal(state.maxSongsPerParticipant, 4)
  assert.equal(state.hostVolume, 35)

  state = rooms.advance(created.code, {
    participantToken: alice.participantToken,
  })
  assert.equal(state.currentSong.title, 'Two')

  state = rooms.transferManager(
    created.code,
    alice.participantToken,
    bob.participant.id,
  )
  assert.equal(state.managerParticipantId, bob.participant.id)
  assert.equal(
    state.participants.find((participant) => participant.id === bob.participant.id)
      .isManager,
    true,
  )
  assert.throws(
    () =>
      rooms.updateRoomSettings(
        created.code,
        { participantToken: alice.participantToken },
        { hostVolume: 50 },
      ),
    /관리 권한/,
  )

  state = rooms.updateRoomSettings(
    created.code,
    { participantToken: bob.participantToken },
    { hostVolume: 50 },
  )
  assert.equal(state.hostVolume, 50)
  db.close()
})
