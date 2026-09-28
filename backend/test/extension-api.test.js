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

const extensionId = 'a'.repeat(32)
const origin = `chrome-extension://${extensionId}`

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
      if ((await fetch(`${baseUrl}/api/health`)).ok) return
    } catch {
      // Child server is starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error('Test server did not start')
}

test('extension API only lists and accepts rooms joined by its authenticated account', { timeout: 10_000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jukebox-extension-'))
  const databasePath = path.join(directory, 'jukebox.sqlite')
  const db = createDatabase(databasePath)
  const memberId = crypto.randomUUID()
  const ownerId = crypto.randomUUID()
  const token = crypto.randomBytes(32).toString('base64url')
  let child
  try {
    const insertUser = db.prepare(
      `INSERT INTO users (id, discord_id, username, global_name, avatar_hash,
        created_at, updated_at, last_login_at)
       VALUES (?, ?, ?, NULL, NULL, 1, 1, 1)`,
    )
    insertUser.run(memberId, memberId, 'member')
    insertUser.run(ownerId, ownerId, 'owner')
    db.prepare(
      `INSERT INTO extension_sessions
         (token_hash, user_id, extension_id, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(hashToken(token), memberId, extensionId, Date.now(), Date.now() + 60_000)

    const rooms = createRoomService(db)
    const joinedRoom = rooms.createRoom({
      ownerUserId: ownerId, participantUserId: ownerId, nickname: 'Owner',
      profileSource: 'account',
    })
    rooms.joinRoom(joinedRoom.code, { nickname: 'Member', userId: memberId })
    const otherRoom = rooms.createRoom({
      ownerUserId: ownerId, participantUserId: ownerId, nickname: 'Owner',
      profileSource: 'account',
    })
    db.close()

    const port = await availablePort()
    const baseUrl = `http://127.0.0.1:${port}`
    child = spawn(process.execPath, ['src/server.js'], {
      cwd: path.resolve(__dirname, '..'),
      env: {
        ...process.env,
        PORT: String(port),
        DATABASE_PATH: databasePath,
        BROWSER_EXTENSION_IDS: extensionId,
        YOUTUBE_API_KEY: '',
      },
      stdio: 'ignore',
    })
    await waitForServer(baseUrl)

    const options = { headers: { Origin: origin, Authorization: `Bearer ${token}` } }
    const ready = await fetch(`${baseUrl}/api/extension/auth/ready`, {
      headers: { Origin: origin },
    })
    assert.equal(ready.status, 200)
    assert.equal((await ready.json()).enabled, false)
    const readyWithoutOrigin = await fetch(
      `${baseUrl}/api/extension/auth/ready?extension_id=${extensionId}`,
    )
    assert.equal((await readyWithoutOrigin.json()).extensionAllowed, true)
    const unregisteredOrigin = 'chrome-extension://' + 'b'.repeat(32)
    const unregisteredReady = await fetch(`${baseUrl}/api/extension/auth/ready?extension_id=${extensionId}`, {
      headers: { Origin: unregisteredOrigin },
    })
    assert.equal(unregisteredReady.status, 200)
    assert.equal(unregisteredReady.headers.get('access-control-allow-origin'), unregisteredOrigin)
    assert.equal((await unregisteredReady.json()).extensionAllowed, false)
    const preflight = await fetch(`${baseUrl}/api/extension/rooms`, {
      method: 'OPTIONS',
      headers: { Origin: origin, 'Access-Control-Request-Method': 'GET' },
    })
    assert.equal(preflight.status, 204)
    assert.equal(preflight.headers.get('access-control-allow-origin'), origin)

    const listed = await fetch(`${baseUrl}/api/extension/rooms`, options)
    assert.equal(listed.status, 200)
    assert.deepEqual((await listed.json()).items.map((room) => room.code), [joinedRoom.code])

    const denied = await fetch(`${baseUrl}/api/extension/rooms/${otherRoom.code}/songs`, {
      ...options,
      method: 'POST',
      headers: { ...options.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId: 'abcdefghijk' }),
    })
    assert.equal(denied.status, 401)
    assert.equal((await denied.json()).error.code, 'PARTICIPANT_REQUIRED')

    const memberRequest = await fetch(`${baseUrl}/api/extension/rooms/${joinedRoom.code}/songs`, {
      ...options,
      method: 'POST',
      headers: { ...options.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId: 'abcdefghijk' }),
    })
    assert.equal(memberRequest.status, 503)
    assert.equal((await memberRequest.json()).error.code, 'YOUTUBE_NOT_CONFIGURED')

    assert.equal((await fetch(`${baseUrl}/api/extension/rooms`, {
      headers: { Origin: unregisteredOrigin, Authorization: `Bearer ${token}` },
    })).status, 403)
    assert.equal((await fetch(`${baseUrl}/api/extension/rooms`, {
      headers: { Origin: origin },
    })).status, 401)

    const logout = await fetch(`${baseUrl}/api/extension/logout`, { ...options, method: 'POST' })
    assert.equal(logout.status, 204)
    assert.equal((await fetch(`${baseUrl}/api/extension/me`, options)).status, 401)
  } finally {
    if (db.isOpen) db.close()
    if (child) {
      const stopped = child.exitCode === null
        ? new Promise((resolve) => child.once('exit', resolve))
        : Promise.resolve()
      child.kill('SIGTERM')
      await stopped
    }
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
