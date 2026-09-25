const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { createDatabase } = require('../src/db')
const { createRoomService } = require('../src/rooms')
const { hashToken } = require('../src/auth')

function availablePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const port = probe.address().port
      probe.close(() => resolve(port))
    })
  })
}

async function waitForServer(baseUrl) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`, {
        signal: AbortSignal.timeout(500),
      })
      if (response.ok) return
    } catch {
      // Wait for the child process to start listening.
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error('Test server did not start')
}

test('lists rooms joined with an account through the home API', { timeout: 10_000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jukebox-joined-'))
  const databasePath = path.join(directory, 'jukebox.sqlite')
  const sessionToken = crypto.randomBytes(32).toString('base64url')
  const db = createDatabase(databasePath)
  let dbClosed = false
  let child

  try {
    const userId = crypto.randomUUID()
    const ownerId = crypto.randomUUID()
    const insertUser = db.prepare(
      `INSERT INTO users (id, discord_id, username, global_name, avatar_hash,
        created_at, updated_at, last_login_at)
       VALUES (?, ?, ?, ?, NULL, 1, 1, 1)`,
    )
    insertUser.run(userId, `discord-${userId}`, 'member', 'M')
    insertUser.run(ownerId, `discord-${ownerId}`, 'owner', 'Owner')
    db.prepare(
      `INSERT INTO auth_sessions (id, user_id, token_hash, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(crypto.randomUUID(), userId, hashToken(sessionToken), Date.now(), Date.now() + 60_000)

    const rooms = createRoomService(db)
    const created = rooms.createRoom({
      ownerUserId: ownerId,
      nickname: 'Owner', participantUserId: ownerId, profileSource: 'account',
    })
    const joined = rooms.joinRoom(created.code, { nickname: 'Member', userId })
    const joinTarget = rooms.createRoom({
      ownerUserId: ownerId,
      nickname: 'Owner', participantUserId: ownerId, profileSource: 'account',
    })
    const hostTarget = rooms.createRoom({
      ownerUserId: ownerId,
      nickname: 'Owner', participantUserId: ownerId, profileSource: 'account',
    })
    rooms.addSong(hostTarget.code, hostTarget.participantToken, {
      videoId: 'aaaaaaaaaaa', title: 'Playing', artist: 'Artist',
      durationSeconds: 180, thumbnailUrl: 'https://example.com/cover.jpg',
    }, ownerId)
    db.close()
    dbClosed = true

    const port = await availablePort()
    const baseUrl = `http://127.0.0.1:${port}`
    child = spawn(process.execPath, ['src/server.js'], {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, PORT: String(port), DATABASE_PATH: databasePath },
      stdio: 'ignore',
    })
    await waitForServer(baseUrl)

    const response = await fetch(`${baseUrl}/api/rooms/joined`, {
      headers: { Cookie: `jukebox_session=${sessionToken}` },
    })
    assert.equal(response.status, 200)
    const { items } = await response.json()
    assert.deepEqual(items.map((room) => room.code), [created.code])
    assert.equal(items[0].participants.length, 2)
    assert.deepEqual(
      items[0].participants.find((participant) => participant.id === joined.participant.id),
      { ...joined.participant, online: false },
    )

    const join = await fetch(`${baseUrl}/api/rooms/${joinTarget.code}/join`, {
      method: 'POST',
      headers: { Cookie: `jukebox_session=${sessionToken}` },
    })
    assert.equal(join.status, 201)
    assert.equal((await join.json()).participant.nickname, 'M')

    const create = await fetch(`${baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { Cookie: `jukebox_session=${sessionToken}`, 'Content-Type': 'application/json' },
      body: '{}',
    })
    assert.equal(create.status, 201)
    assert.equal((await create.json()).participant.nickname, 'M')

    const allDevicesCreate = await fetch(`${baseUrl}/api/rooms`, {
      method: 'POST',
      headers: { Cookie: `jukebox_session=${sessionToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ playbackMode: 'all_devices' }),
    })
    assert.equal(allDevicesCreate.status, 201)
    const allDevicesRoom = await allDevicesCreate.json()
    assert.equal(allDevicesRoom.playbackMode, 'all_devices')
    assert.equal(Object.hasOwn(allDevicesRoom, 'hostToken'), false)
    assert.ok(allDevicesRoom.participantToken)
    const hostClaim = await fetch(`${baseUrl}/api/rooms/${allDevicesRoom.code}/host`, {
      method: 'POST',
      headers: { Cookie: `jukebox_session=${sessionToken}` },
    })
    assert.equal(hostClaim.status, 409)
    assert.equal((await hostClaim.json()).error.code, 'HOST_ONLY_REQUIRED')

    const hostControl = await fetch(`${baseUrl}/api/rooms/${hostTarget.code}/advance`, {
      method: 'POST',
      headers: {
        Cookie: `jukebox_session=${sessionToken}`,
        'x-host-token': hostTarget.hostToken,
      },
    })
    assert.equal(hostControl.status, 200)
    assert.equal((await hostControl.json()).currentSong, null)

    const leave = await fetch(`${baseUrl}/api/rooms/${created.code}/membership`, {
      method: 'DELETE',
      headers: { Cookie: `jukebox_session=${sessionToken}` },
    })
    assert.equal(leave.status, 204)
    const verificationDb = createDatabase(databasePath)
    try {
      const departures = verificationDb.prepare(
        `SELECT participant_id, nickname FROM room_feed_entries
         WHERE event_type = 'participant_left'`,
      ).all()
      assert.deepEqual(departures.map((row) => ({ ...row })), [{
        participant_id: joined.participant.id,
        nickname: joined.participant.nickname,
      }])
      const hostEvent = verificationDb.prepare(
        `SELECT actor_type FROM room_feed_entries
         WHERE room_id = (SELECT id FROM rooms WHERE code = ?) AND event_type = 'song_skipped'`,
      ).get(hostTarget.code)
      assert.equal(hostEvent.actor_type, 'host')
      assert.equal(
        verificationDb.prepare('SELECT host_token_hash FROM rooms WHERE code = ?').get(allDevicesRoom.code).host_token_hash,
        '',
      )
    } finally {
      verificationDb.close()
    }
  } finally {
    if (child) {
      const stopped = child.exitCode === null
        ? new Promise((resolve) => child.once('exit', resolve))
        : Promise.resolve()
      child.kill('SIGTERM')
      await stopped
    }
    if (!dbClosed) db.close()
    if (path.resolve(directory).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`)) {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  }
})

test('broadcasts the refreshed song permissions when a requester reconnects', { timeout: 10_000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jukebox-reconnect-'))
  const databasePath = path.join(directory, 'jukebox.sqlite')
  const db = createDatabase(databasePath)
  let dbClosed = false
  let child

  try {
    const ownerId = crypto.randomUUID()
    db.prepare(
      `INSERT INTO users (id, discord_id, username, global_name, avatar_hash,
        created_at, updated_at, last_login_at)
       VALUES (?, ?, 'owner', 'Owner', NULL, 1, 1, 1)`,
    ).run(ownerId, `discord-${ownerId}`)
    const rooms = createRoomService(db)
    const created = rooms.createRoom({ ownerUserId: ownerId })
    const requester = rooms.joinRoom(created.code, { nickname: 'Requester' })
    rooms.addSong(created.code, requester.participantToken, {
      videoId: 'aaaaaaaaaaa', title: 'Playing', artist: 'Artist',
      durationSeconds: 180, thumbnailUrl: 'https://example.com/cover.jpg',
    })
    db.close()
    dbClosed = true

    const port = await availablePort()
    const baseUrl = `http://127.0.0.1:${port}`
    child = spawn(process.execPath, ['src/server.js'], {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, PORT: String(port), DATABASE_PATH: databasePath },
      stdio: 'ignore',
    })
    await waitForServer(baseUrl)

    const before = await fetch(`${baseUrl}/api/rooms/${created.code}`)
    assert.notEqual((await before.json()).currentSong.otherControlAvailableAt, null)

    const handshake = await fetch(`${baseUrl}/socket.io/?EIO=4&transport=polling`)
    assert.equal(handshake.status, 200)
    const { sid } = JSON.parse((await handshake.text()).slice(1))
    const pollingUrl = `${baseUrl}/socket.io/?EIO=4&transport=polling&sid=${sid}`
    const postPacket = (body) => fetch(pollingUrl, {
      method: 'POST', headers: { 'Content-Type': 'text/plain' }, body,
    })
    assert.equal((await postPacket('40')).status, 200)
    await fetch(pollingUrl).then((response) => response.text())
    assert.equal((await postPacket(`42["room:subscribe",${JSON.stringify({
      code: created.code, participantToken: requester.participantToken,
    })}]`)).status, 200)
    const packets = (await fetch(pollingUrl, { signal: AbortSignal.timeout(2_000) }).then((response) => response.text()))
      .split('\x1e')
    const roomState = packets
      .filter((packet) => packet.startsWith('42'))
      .map((packet) => JSON.parse(packet.slice(2)))
      .find(([event]) => event === 'room:state')?.[1]
    assert.ok(roomState)
    assert.equal(roomState.currentSong.otherControlAvailableAt, null)
  } finally {
    if (child) {
      const stopped = child.exitCode === null
        ? new Promise((resolve) => child.once('exit', resolve))
        : Promise.resolve()
      child.kill('SIGTERM')
      await stopped
    }
    if (!dbClosed) db.close()
    if (path.resolve(directory).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`)) {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  }
})
