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
    insertUser.run(userId, `discord-${userId}`, 'member', 'Member')
    insertUser.run(ownerId, `discord-${ownerId}`, 'owner', 'Owner')
    db.prepare(
      `INSERT INTO auth_sessions (id, user_id, token_hash, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(crypto.randomUUID(), userId, hashToken(sessionToken), Date.now(), Date.now() + 60_000)

    const rooms = createRoomService(db)
    const created = rooms.createRoom({
      retentionMode: 'permanent', ownerUserId: ownerId,
      nickname: 'Owner', participantUserId: ownerId, profileSource: 'account',
    })
    const joined = rooms.joinRoom(created.code, { nickname: 'Member', userId })
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
