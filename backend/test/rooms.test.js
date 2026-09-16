const test = require('node:test')
const assert = require('node:assert/strict')
const { createDatabase } = require('../src/db')
const { createRoomService } = require('../src/rooms')

function song(videoId, title, durationSeconds = 180) {
  return {
    videoId,
    title,
    artist: 'Test Artist',
    durationSeconds,
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

test('stores the selected playback mode and maintains a shared timeline', () => {
  const db = createDatabase()
  let currentTime = 1_000_000
  const rooms = createRoomService(db, {
    roomTtlHours: 1,
    now: () => currentTime,
  })
  const created = rooms.createRoom({
    maxSongsPerParticipant: 2,
    playbackMode: 'all_devices',
  })
  const alice = rooms.joinRoom(created.code, { nickname: 'Alice' })

  assert.equal(created.playbackMode, 'all_devices')
  let state = rooms.addSong(
    created.code,
    alice.participantToken,
    song('aaaaaaaaaaa', 'One'),
  )
  assert.equal(state.playbackMode, 'all_devices')
  assert.equal(state.playbackPositionSeconds, 0)
  assert.equal(state.playbackAnchorAt, currentTime)
  assert.equal(state.playbackRevision, 1)
  assert.equal(state.serverTime, currentTime)

  currentTime += 5_250
  state = rooms.setPlaybackPaused(
    created.code,
    { participantToken: alice.participantToken },
    true,
  )
  assert.equal(state.playbackPaused, true)
  assert.equal(state.playbackPositionSeconds, 5.25)
  assert.equal(state.playbackAnchorAt, currentTime)
  assert.equal(state.playbackRevision, 2)

  currentTime += 10_000
  state = rooms.setPlaybackPaused(
    created.code,
    { participantToken: alice.participantToken },
    false,
  )
  assert.equal(state.playbackPaused, false)
  assert.equal(state.playbackPositionSeconds, 5.25)
  assert.equal(state.playbackAnchorAt, currentTime)
  assert.equal(state.playbackRevision, 3)

  currentTime += 2_000
  state = rooms.reportPlaybackBlocked(created.code, created.hostToken, true)
  assert.equal(state.playbackPaused, false)
  assert.equal(state.playbackBlocked, false)
  assert.equal(state.playbackRevision, 3)
  db.close()
})

test('automatically advances completed all-device playback from the server timeline', () => {
  const db = createDatabase()
  let currentTime = 1_000_000
  const rooms = createRoomService(db, {
    roomTtlHours: 1,
    now: () => currentTime,
  })
  const created = rooms.createRoom({
    maxSongsPerParticipant: 2,
    playbackMode: 'all_devices',
  })
  const alice = rooms.joinRoom(created.code, { nickname: 'Alice' })
  rooms.addSong(
    created.code,
    alice.participantToken,
    song('aaaaaaaaaaa', 'One', 20),
  )
  rooms.addSong(
    created.code,
    alice.participantToken,
    song('bbbbbbbbbbb', 'Two', 30),
  )

  currentTime += 19_999
  assert.deepEqual(rooms.advanceCompletedAllDeviceRooms(), [])

  currentTime += 1
  const advanced = rooms.advanceCompletedAllDeviceRooms()
  assert.equal(advanced.length, 1)
  assert.equal(advanced[0].currentSong.title, 'Two')
  assert.equal(advanced[0].queue.length, 0)
  assert.equal(advanced[0].playbackAnchorAt, currentTime)
  assert.deepEqual(rooms.advanceCompletedAllDeviceRooms(), [])
  db.close()
})

test('does not server-advance host-only or paused playback', () => {
  const db = createDatabase()
  let currentTime = 1_000_000
  const rooms = createRoomService(db, { now: () => currentTime })
  const hostOnly = rooms.createRoom({ playbackMode: 'host_only' })
  const hostParticipant = rooms.joinRoom(hostOnly.code, { nickname: 'Host mode' })
  rooms.addSong(
    hostOnly.code,
    hostParticipant.participantToken,
    song('aaaaaaaaaaa', 'Host song', 10),
  )

  const synchronized = rooms.createRoom({ playbackMode: 'all_devices' })
  const synchronizedParticipant = rooms.joinRoom(synchronized.code, {
    nickname: 'Synchronized mode',
  })
  rooms.addSong(
    synchronized.code,
    synchronizedParticipant.participantToken,
    song('bbbbbbbbbbb', 'Paused song', 10),
  )
  rooms.setPlaybackPaused(
    synchronized.code,
    { participantToken: synchronizedParticipant.participantToken },
    true,
  )

  currentTime += 20_000
  assert.deepEqual(rooms.advanceCompletedAllDeviceRooms(), [])
  assert.equal(rooms.getPublicRoom(hostOnly.code).currentSong.title, 'Host song')
  assert.equal(
    rooms.getPublicRoom(synchronized.code).currentSong.title,
    'Paused song',
  )
  db.close()
})

test('defaults to host-only playback and rejects unknown playback modes', () => {
  const db = createDatabase()
  const rooms = createRoomService(db)
  const created = rooms.createRoom()

  assert.equal(created.playbackMode, 'host_only')
  assert.equal(rooms.getPublicRoom(created.code).playbackMode, 'host_only')
  assert.throws(
    () => rooms.createRoom({ playbackMode: 'somewhere_else' }),
    /재생 방식/,
  )
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
  assert.equal(state.playbackPaused, false)
  assert.equal(state.playbackBlocked, false)
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
  assert.throws(
    () =>
      rooms.setPlaybackPaused(
        created.code,
        { participantToken: bob.participantToken },
        true,
      ),
    /관리 권한/,
  )

  state = rooms.setPlaybackPaused(
    created.code,
    { participantToken: alice.participantToken },
    true,
  )
  assert.equal(state.playbackPaused, true)
  assert.equal(state.playbackBlocked, false)

  assert.throws(
    () =>
      rooms.reportPlaybackBlocked(
        created.code,
        'wrong-token',
        true,
      ),
    /호스트 권한/,
  )
  state = rooms.reportPlaybackBlocked(
    created.code,
    created.hostToken,
    true,
  )
  assert.equal(state.playbackPaused, true)
  assert.equal(state.playbackBlocked, true)

  state = rooms.reportPlaybackBlocked(
    created.code,
    created.hostToken,
    false,
  )
  assert.equal(state.playbackPaused, false)
  assert.equal(state.playbackBlocked, false)

  state = rooms.reportPlaybackBlocked(
    created.code,
    created.hostToken,
    true,
  )
  state = rooms.setPlaybackPaused(
    created.code,
    { participantToken: alice.participantToken },
    false,
  )
  assert.equal(state.playbackPaused, false)
  assert.equal(state.playbackBlocked, false)

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
  assert.equal(state.playbackPaused, false)
  assert.equal(state.playbackBlocked, false)

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
