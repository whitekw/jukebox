const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { createDatabase } = require('../src/db')
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
      // The child process has not started listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error('Test server did not start')
}

test('logging out disconnects sockets authenticated by the same session', { timeout: 10_000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jukebox-logout-'))
  const databasePath = path.join(directory, 'jukebox.sqlite')
  const sessionToken = crypto.randomBytes(32).toString('base64url')
  const db = createDatabase(databasePath)
  const userId = crypto.randomUUID()
  db.prepare(
    `INSERT INTO users (id, discord_id, username, global_name, avatar_hash,
      created_at, updated_at, last_login_at)
     VALUES (?, ?, 'tester', 'Tester', NULL, 1, 1, 1)`,
  ).run(userId, `discord-${userId}`)
  db.prepare(
    `INSERT INTO auth_sessions (id, user_id, token_hash, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(crypto.randomUUID(), userId, hashToken(sessionToken), Date.now(), Date.now() + 60_000)
  db.close()

  const port = await availablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const cookie = `jukebox_session=${sessionToken}`
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT: String(port), DATABASE_PATH: databasePath },
    stdio: 'ignore',
  })

  try {
    await waitForServer(baseUrl)
    const handshake = await fetch(`${baseUrl}/socket.io/?EIO=4&transport=polling`, {
      headers: { Cookie: cookie },
    })
    const handshakeBody = await handshake.text()
    assert.equal(handshake.status, 200)
    assert.ok(handshakeBody.startsWith('0{'))
    const { sid } = JSON.parse(handshakeBody.slice(1))
    const pollingUrl = `${baseUrl}/socket.io/?EIO=4&transport=polling&sid=${sid}`
    const connected = await fetch(pollingUrl, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'text/plain' },
      body: '40',
    })
    assert.equal(connected.status, 200)
    const namespace = await fetch(pollingUrl, { headers: { Cookie: cookie } })
    assert.match(await namespace.text(), /^40\{/)

    const logout = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: cookie },
    })
    assert.equal(logout.status, 204)
    const session = await fetch(`${baseUrl}/api/auth/session`, { headers: { Cookie: cookie } })
    assert.equal((await session.json()).user, null)
    const afterLogout = await fetch(pollingUrl, { headers: { Cookie: cookie } })
    const packet = await afterLogout.text()
    assert.ok(afterLogout.status === 400 || packet.includes('1'))
  } finally {
    const stopped = child.exitCode === null
      ? new Promise((resolve) => child.once('exit', resolve))
      : Promise.resolve()
    child.kill('SIGTERM')
    await stopped
    if (path.resolve(directory).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`)) {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  }
})
