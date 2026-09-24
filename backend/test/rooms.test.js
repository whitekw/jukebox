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

test('stores and returns the latest room chat messages for participants', () => {
  const db = createDatabase()
  let currentTime = 1_000
  const rooms = createRoomService(db, { now: () => currentTime })
  const created = rooms.createRoom()
  const alice = rooms.joinRoom(created.code, { nickname: 'Alice' })
  const bob = rooms.joinRoom(created.code, { nickname: 'Bob' })

  const first = rooms.addChatMessage(
    created.code,
    alice.participantToken,
    '  안녕하세요  ',
  )
  currentTime += 1
  const second = rooms.addChatMessage(
    created.code,
    bob.participantToken,
    '반갑습니다',
  )

  assert.deepEqual(first, {
    id: first.id,
    sequence: first.sequence,
    type: 'message',
    participantId: alice.participant.id,
    nickname: 'Alice',
    actorType: 'participant',
    content: '안녕하세요',
    createdAt: 1_000,
  })
  assert.ok(second.sequence > first.sequence)
  assert.deepEqual(
    rooms.listChatMessages(created.code, bob.participantToken),
    [first, second],
  )
  assert.throws(
    () => rooms.listChatMessages(created.code, 'wrong-token'),
    /다시 참여/,
  )
  assert.throws(
    () => rooms.addChatMessage(created.code, alice.participantToken, '   '),
    /1~300자/,
  )
  assert.throws(
    () =>
      rooms.addChatMessage(
        created.code,
        alice.participantToken,
        'a'.repeat(301),
      ),
    /1~300자/,
  )

  for (let index = 0; index < 101; index += 1) {
    currentTime += 1
    rooms.addChatMessage(
      created.code,
      alice.participantToken,
      `message-${index}`,
    )
  }
  const latestMessages = rooms.listChatMessages(
    created.code,
    alice.participantToken,
  )
  assert.equal(latestMessages.length, 100)
  assert.equal(latestMessages[0].content, 'message-1')
  assert.equal(latestMessages.at(-1).content, 'message-100')

  db.close()
})

test('stores structured room events in the chat timeline', () => {
  const db = createDatabase()
  let currentTime = 2_000
  const rooms = createRoomService(db, { now: () => currentTime })
  const created = rooms.createRoom()
  const alice = rooms.joinRoom(created.code, { nickname: 'Alice' })

  const joined = rooms.addRoomEvent(
    created.code,
    'participant_joined',
    { participantId: alice.participant.id },
  )
  currentTime += 1
  const added = rooms.addRoomEvent(
    created.code,
    'song_added',
    { participantToken: alice.participantToken },
    { title: 'One' },
  )
  currentTime += 1
  const paused = rooms.addRoomEvent(
    created.code,
    'playback_paused',
    { hostToken: created.hostToken },
  )
  currentTime += 1
  const promoted = rooms.addRoomEvent(
    created.code,
    'manager_added',
    {},
    { target: 'Alice', automatic: true },
  )

  assert.deepEqual(joined, {
    id: joined.id,
    sequence: joined.sequence,
    type: 'system',
    participantId: alice.participant.id,
    nickname: 'Alice',
    actorType: 'participant',
    eventType: 'participant_joined',
    data: {},
    createdAt: 2_000,
  })
  assert.ok(added.sequence > joined.sequence)
  assert.equal(added.data.title, 'One')
  assert.equal(paused.actorType, 'host')
  assert.equal(paused.nickname, null)
  assert.equal(promoted.actorType, 'system')
  assert.deepEqual(
    rooms.listChatMessages(created.code, alice.participantToken),
    [joined, added, paused, promoted],
  )
  assert.throws(
    () => rooms.addRoomEvent(created.code, 'unknown_event'),
    /Unsupported room event type/,
  )

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
  const bob = rooms.joinRoom(created.code, { nickname: 'Bob' })

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
  assert.throws(
    () =>
      rooms.startPlayback(
        created.code,
        { participantToken: 'wrong-token' },
        'aaaaaaaaaaa',
        0.2,
      ),
    /다시 참여/,
  )
  state = rooms.startPlayback(
    created.code,
    { participantToken: bob.participantToken },
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

test('creates a room and its first participant together', () => {
  const db = createDatabase()
  const rooms = createRoomService(db)

  assert.throws(
    () => rooms.createRoom({ nickname: 'A' }),
    /닉네임은 2~20자/,
  )
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM rooms').get().count, 0)

  const created = rooms.createRoom({ nickname: 'Creator' })
  const state = rooms.getPublicRoom(created.code)
  assert.ok(created.participantToken)
  assert.equal(created.participant.nickname, 'Creator')
  assert.equal(created.participant.isManager, true)
  assert.equal(state.participants.length, 1)
  assert.equal(state.participants[0].nickname, 'Creator')
  assert.equal(state.participants[0].isManager, true)
  db.close()
})

test('stores an account profile snapshot for the room participant', () => {
  const db = createDatabase()
  const rooms = createRoomService(db)
  db.prepare(
    `INSERT INTO users (
       id, discord_id, username, global_name, avatar_hash,
       created_at, updated_at, last_login_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run('user-1', 'discord-1', 'owner', 'Owner', null, 1, 1, 1)

  const created = rooms.createRoom({
    nickname: 'Owner',
    participantUserId: 'user-1',
    profileSource: 'account',
    avatarUrl: 'https://cdn.example.com/avatar.webp',
  })
  const state = rooms.getPublicRoom(created.code)

  assert.equal(created.participant.nickname, 'Owner')
  assert.equal(
    created.participant.avatarUrl,
    'https://cdn.example.com/avatar.webp',
  )
  assert.equal(
    state.participants[0].avatarUrl,
    'https://cdn.example.com/avatar.webp',
  )
  const storedProfile = db
    .prepare(
      `SELECT user_id, profile_source, avatar_url
       FROM participants WHERE id = ?`,
    )
    .get(created.participant.id)
  assert.equal(storedProfile.user_id, 'user-1')
  assert.equal(storedProfile.profile_source, 'account')
  assert.equal(
    storedProfile.avatar_url,
    'https://cdn.example.com/avatar.webp',
  )
  db.close()
})

test('keeps permanent rooms and grants their account owner control', () => {
  const db = createDatabase()
  let currentTime = 1_000_000
  db.prepare(
    `INSERT INTO users (
       id, discord_id, username, global_name, avatar_hash,
       created_at, updated_at, last_login_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    'owner-1',
    'discord-1',
    'owner',
    'Owner',
    null,
    currentTime,
    currentTime,
    currentTime,
  )
  const rooms = createRoomService(db, {
    roomTtlHours: 1,
    emptyRoomTtlHours: 1,
    now: () => currentTime,
  })
  const created = rooms.createRoom({
    retentionMode: 'permanent',
    ownerUserId: 'owner-1',
  })
  const alice = rooms.joinRoom(created.code, { nickname: 'Alice' })
  const bob = rooms.joinRoom(created.code, { nickname: 'Bob' })
  rooms.addSong(created.code, alice.participantToken, song('aaaaaaaaaaa', 'One'))

  assert.equal(created.expiresAt, null)
  assert.equal(rooms.getPublicRoom(created.code).retentionMode, 'permanent')
  assert.equal(
    rooms.getRoomSession(created.code, { userId: 'owner-1' }).isOwner,
    true,
  )
  rooms.setManager(
    created.code,
    { userId: 'owner-1' },
    bob.participant.id,
    true,
  )
  assert.equal(
    rooms
      .getPublicRoom(created.code)
      .participants.find((participant) => participant.id === bob.participant.id)
      .isManager,
    true,
  )
  rooms.setPlaybackPaused(created.code, { userId: 'owner-1' }, true)
  assert.equal(rooms.listOwnedRooms('owner-1').length, 1)

  rooms.markRoomEmpty(created.code)
  currentTime += 7 * 24 * 60 * 60 * 1000
  assert.equal(rooms.deleteExpiredRooms(), 0)
  assert.equal(rooms.getPublicRoom(created.code).code, created.code)
  assert.throws(
    () => rooms.deleteOwnedRoom(created.code, 'someone-else'),
    /소유자/,
  )
  assert.deepEqual(rooms.deleteOwnedRoom(created.code, 'owner-1'), {
    code: created.code,
  })
  assert.equal(rooms.listOwnedRooms('owner-1').length, 0)
  assert.throws(() => rooms.getPublicRoom(created.code), /존재하지 않거나 만료/)
  db.close()
})

test('lets a permanent room owner move host playback to a new device', () => {
  const db = createDatabase()
  const rooms = createRoomService(db)
  db.prepare(
    `INSERT INTO users (
       id, discord_id, username, global_name, avatar_hash,
       created_at, updated_at, last_login_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run('owner-1', 'discord-1', 'owner', 'Owner', null, 1, 1, 1)
  const created = rooms.createRoom({
    retentionMode: 'permanent',
    ownerUserId: 'owner-1',
  })

  assert.throws(
    () => rooms.claimHost(created.code),
    /로그인/,
  )
  assert.throws(
    () => rooms.claimHost(created.code, 'someone-else'),
    /소유자/,
  )

  const claimed = rooms.claimHost(created.code, 'owner-1')
  assert.notEqual(claimed.hostToken, created.hostToken)
  assert.equal(claimed.room.code, created.code)
  assert.throws(
    () =>
      rooms.getRoomSession(created.code, {
        hostToken: created.hostToken,
      }),
    /세션이 유효하지/,
  )
  assert.equal(
    rooms.getRoomSession(created.code, {
      hostToken: claimed.hostToken,
    }).isHost,
    true,
  )
  db.close()
})

test('requires an account for permanent rooms and keeps temporary rooms while occupied', () => {
  const db = createDatabase()
  let currentTime = 1_000_000
  const rooms = createRoomService(db, {
    roomTtlHours: 1,
    emptyRoomTtlHours: 1,
    now: () => currentTime,
  })

  assert.throws(
    () => rooms.createRoom({ retentionMode: 'permanent' }),
    /로그인/,
  )
  assert.throws(
    () => rooms.createRoom({ retentionMode: 'unknown' }),
    /유지 방식/,
  )

  const created = rooms.createRoom({ retentionMode: 'temporary' })
  rooms.markRoomOccupied(created.code)
  currentTime += 2 * 60 * 60 * 1000
  assert.equal(rooms.deleteExpiredRooms(), 0)
  assert.equal(rooms.getPublicRoom(created.code).code, created.code)
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

test('assigns multiple managers and enforces participant manager controls', () => {
  const db = createDatabase()
  const rooms = createRoomService(db)
  const created = rooms.createRoom()
  const alice = rooms.joinRoom(created.code, { nickname: 'Alice' })
  const bob = rooms.joinRoom(created.code, { nickname: 'Bob' })

  let state = rooms.getPublicRoom(created.code)
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

  state = rooms.setManager(
    created.code,
    alice.participantToken,
    bob.participant.id,
    true,
  )
  assert.deepEqual(
    state.participants.map(({ nickname, isManager }) => ({ nickname, isManager })),
    [
      { nickname: 'Alice', isManager: true },
      { nickname: 'Bob', isManager: true },
    ],
  )

  state = rooms.updateRoomSettings(
    created.code,
    { participantToken: alice.participantToken },
    { hostVolume: 45 },
  )
  assert.equal(state.hostVolume, 45)

  state = rooms.setManager(
    created.code,
    bob.participantToken,
    alice.participant.id,
    false,
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
  assert.throws(
    () =>
      rooms.setManager(
        created.code,
        bob.participantToken,
        bob.participant.id,
        false,
      ),
    /최소 한 명/,
  )
  db.close()
})

test('adds the oldest online participant when every manager is offline', () => {
  const db = createDatabase()
  const rooms = createRoomService(db)
  const created = rooms.createRoom()
  const alice = rooms.joinRoom(created.code, { nickname: 'Alice' })
  const bob = rooms.joinRoom(created.code, { nickname: 'Bob' })
  const charlie = rooms.joinRoom(created.code, { nickname: 'Charlie' })

  let state = rooms.ensureOnlineManager(created.code, [
    alice.participant.id,
    bob.participant.id,
    charlie.participant.id,
  ])
  assert.deepEqual(
    state.participants.filter(({ isManager }) => isManager).map(({ id }) => id),
    [alice.participant.id],
  )

  state = rooms.ensureOnlineManager(created.code, [
    bob.participant.id,
    charlie.participant.id,
  ])
  assert.deepEqual(
    state.participants.filter(({ isManager }) => isManager).map(({ id }) => id),
    [alice.participant.id, bob.participant.id],
  )

  state = rooms.ensureOnlineManager(created.code, [])
  assert.deepEqual(
    state.participants.filter(({ isManager }) => isManager).map(({ id }) => id),
    [alice.participant.id, bob.participant.id],
  )

  state = rooms.ensureOnlineManager(created.code, [charlie.participant.id])
  assert.deepEqual(
    state.participants.filter(({ isManager }) => isManager).map(({ id }) => id),
    [alice.participant.id, bob.participant.id, charlie.participant.id],
  )

  state = rooms.ensureOnlineManager(created.code, [alice.participant.id])
  assert.deepEqual(
    state.participants.filter(({ isManager }) => isManager).map(({ id }) => id),
    [alice.participant.id, bob.participant.id, charlie.participant.id],
  )
  db.close()
})
