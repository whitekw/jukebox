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
  const created = rooms.createRoom()
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

test('allows unlimited requests while enforcing duplicate prevention and host token', () => {
  const db = createDatabase()
  const rooms = createRoomService(db)
  const created = rooms.createRoom()
  const alice = rooms.joinRoom(created.code, { nickname: 'Alice' })
  rooms.addSong(created.code, alice.participantToken, song('aaaaaaaaaaa', 'One'))
  const state = rooms.addSong(
    created.code,
    alice.participantToken,
    song('bbbbbbbbbbb', 'Two'),
  )
  assert.equal(state.queue.length, 1)

  assert.throws(
    () => rooms.addSong(created.code, alice.participantToken, song('aaaaaaaaaaa', 'One')),
    /이미 재생 중이거나 대기열/,
  )
  assert.throws(() => rooms.advance(created.code, 'wrong-token'), /호스트 권한/)
  db.close()
})

test('reorders queued songs by their final index', () => {
  const db = createDatabase()
  const rooms = createRoomService(db)
  const created = rooms.createRoom()
  const alice = rooms.joinRoom(created.code, { nickname: 'Alice' })

  rooms.addSong(created.code, alice.participantToken, song('aaaaaaaaaaa', 'One'))
  rooms.addSong(created.code, alice.participantToken, song('bbbbbbbbbbb', 'Two'))
  rooms.addSong(created.code, alice.participantToken, song('ccccccccccc', 'Three'))
  let state = rooms.addSong(
    created.code,
    alice.participantToken,
    song('ddddddddddd', 'Four'),
  )

  const four = state.queue.find((queuedSong) => queuedSong.title === 'Four')
  state = rooms.reorderSong(
    created.code,
    { participantToken: alice.participantToken },
    four.id,
    0,
  )
  assert.deepEqual(state.queue.map((queuedSong) => queuedSong.title), [
    'Four',
    'Two',
    'Three',
  ])

  const two = state.queue.find((queuedSong) => queuedSong.title === 'Two')
  state = rooms.reorderSong(
    created.code,
    { participantToken: alice.participantToken },
    two.id,
    2,
  )
  assert.deepEqual(state.queue.map((queuedSong) => queuedSong.title), [
    'Four',
    'Three',
    'Two',
  ])
  assert.throws(
    () =>
      rooms.reorderSong(
        created.code,
        { participantToken: alice.participantToken },
        two.id,
        3,
      ),
    /대기열 위치/,
  )
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
  assert.equal(state.playbackPending, true)
  assert.equal(state.playbackRevision, 1)
  assert.equal(state.serverTime, currentTime)

  currentTime += 3_000
  assert.deepEqual(rooms.advanceCompletedAllDeviceRooms(), [])
  state = rooms.startPlayback(
    created.code,
    { participantToken: alice.participantToken },
    'aaaaaaaaaaa',
    0.2,
  )
  assert.equal(state.playbackPending, false)
  assert.equal(state.playbackPositionSeconds, 0.2)
  assert.equal(state.playbackAnchorAt, currentTime)
  assert.equal(state.playbackRevision, 2)

  currentTime += 5_250
  state = rooms.setPlaybackPaused(
    created.code,
    { participantToken: alice.participantToken },
    true,
  )
  assert.equal(state.playbackPaused, true)
  assert.equal(state.playbackPositionSeconds, 5.45)
  assert.equal(state.playbackAnchorAt, currentTime)
  assert.equal(state.playbackRevision, 3)

  currentTime += 10_000
  state = rooms.setPlaybackPaused(
    created.code,
    { participantToken: alice.participantToken },
    false,
  )
  assert.equal(state.playbackPaused, false)
  assert.equal(state.playbackPositionSeconds, 5.45)
  assert.equal(state.playbackAnchorAt, currentTime)
  assert.equal(state.playbackRevision, 4)

  currentTime += 2_000
  state = rooms.reportPlaybackBlocked(created.code, created.hostToken, true)
  assert.equal(state.playbackPaused, false)
  assert.equal(state.playbackBlocked, false)
  assert.equal(state.playbackRevision, 4)
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
  rooms.startPlayback(
    created.code,
    { participantToken: alice.participantToken },
    'aaaaaaaaaaa',
    0,
  )

  currentTime += 19_999
  assert.deepEqual(rooms.advanceCompletedAllDeviceRooms(), [])

  currentTime += 1
  const advanced = rooms.advanceCompletedAllDeviceRooms()
  assert.equal(advanced.length, 1)
  assert.equal(advanced[0].currentSong.title, 'Two')
  assert.equal(advanced[0].queue.length, 0)
  assert.equal(advanced[0].playbackAnchorAt, currentTime)
  assert.equal(advanced[0].playbackPending, true)
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

test('validates stored room sessions for hosts and participants', () => {
  const db = createDatabase()
  const rooms = createRoomService(db)
  const created = rooms.createRoom()
  const alice = rooms.joinRoom(created.code, { nickname: 'Alice' })

  const hostSession = rooms.getRoomSession(created.code, {
    hostToken: created.hostToken,
  })
  assert.equal(hostSession.isHost, true)
  assert.equal(hostSession.participant, null)

  const participantSession = rooms.getRoomSession(created.code, {
    participantToken: alice.participantToken,
  })
  assert.equal(participantSession.isHost, false)
  assert.equal(participantSession.participant.nickname, 'Alice')
  assert.equal(
    rooms.hasActiveSession(created.code, {
      participantToken: alice.participantToken,
    }),
    true,
  )
  assert.equal(
    rooms.hasActiveSession(created.code, { participantToken: 'invalid' }),
    false,
  )
  assert.throws(
    () =>
      rooms.getRoomSession(created.code, {
        participantToken: 'invalid',
      }),
    /저장된 세션/,
  )
  db.close()
})

test('deletes a room after it remains empty for one hour', () => {
  const db = createDatabase()
  let currentTime = 1_000_000
  const rooms = createRoomService(db, {
    roomTtlHours: 24,
    emptyRoomTtlHours: 1,
    now: () => currentTime,
  })
  const created = rooms.createRoom()

  currentTime += 60 * 60 * 1000 - 1
  assert.equal(rooms.deleteExpiredRooms(), 0)

  rooms.markRoomOccupied(created.code)
  currentTime += 2 * 60 * 60 * 1000
  assert.equal(rooms.deleteExpiredRooms(), 0)

  rooms.markRoomEmpty(created.code)
  currentTime += 60 * 60 * 1000 - 1
  assert.equal(rooms.deleteExpiredRooms(), 0)
  currentTime += 1
  assert.equal(rooms.deleteExpiredRooms(), 1)
  assert.throws(() => rooms.getPublicRoom(created.code), /존재하지 않거나 만료/)
  db.close()
})

test('allows participants to remove and skip only their own songs', () => {
  const db = createDatabase()
  const rooms = createRoomService(db)
  const created = rooms.createRoom()
  const alice = rooms.joinRoom(created.code, { nickname: 'Alice' })
  const bob = rooms.joinRoom(created.code, { nickname: 'Bob' })

  rooms.addSong(created.code, alice.participantToken, song('aaaaaaaaaaa', 'Alice current'))
  let state = rooms.addSong(
    created.code,
    bob.participantToken,
    song('bbbbbbbbbbb', 'Bob queued'),
  )
  state = rooms.addSong(
    created.code,
    alice.participantToken,
    song('ccccccccccc', 'Alice queued'),
  )
  const bobSong = state.queue.find((queuedSong) => queuedSong.title === 'Bob queued')
  const aliceSong = state.queue.find(
    (queuedSong) => queuedSong.title === 'Alice queued',
  )

  assert.throws(
    () =>
      rooms.removeSong(
        created.code,
        { participantToken: bob.participantToken },
        aliceSong.id,
      ),
    /본인이 신청한 곡/,
  )
  state = rooms.removeSong(
    created.code,
    { participantToken: bob.participantToken },
    bobSong.id,
  )
  assert.deepEqual(state.queue.map((queuedSong) => queuedSong.title), [
    'Alice queued',
  ])

  state = rooms.addSong(
    created.code,
    bob.participantToken,
    song('ddddddddddd', 'Bob next'),
  )
  assert.throws(
    () =>
      rooms.advance(created.code, {
        participantToken: bob.participantToken,
      }),
    /본인이 신청한 곡/,
  )
  state = rooms.advance(created.code, {
    participantToken: alice.participantToken,
  })
  assert.equal(state.currentSong.title, 'Alice queued')
  state = rooms.advance(created.code, {
    participantToken: alice.participantToken,
  })
  assert.equal(state.currentSong.title, 'Bob next')
  state = rooms.advance(created.code, {
    participantToken: bob.participantToken,
  })
  assert.equal(state.currentSong, null)
  db.close()
})

test('assigns, transfers and enforces participant manager controls', () => {
  const db = createDatabase()
  const rooms = createRoomService(db)
  const created = rooms.createRoom()
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
    /본인이 신청한 곡/,
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
    { hostVolume: 35 },
  )
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
