const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const net = require('node:net')
const { spawn } = require('node:child_process')
const { once } = require('node:events')
const { createDatabase } = require('../src/db')
const { hashToken } = require('../src/auth')

test('account API authenticates, protects mutations behind a proxy, updates sessions and revokes withdrawal', { timeout: 15000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jukebox-account-'))
  const databasePath = path.join(directory, 'test.sqlite')
  const db = createDatabase(databasePath)
  db.exec("INSERT INTO users (id, discord_id, username, created_at, updated_at, last_login_at) VALUES ('user1', 'discord1', 'Tester', 1, 1, 1)")
  db.prepare('INSERT INTO auth_sessions VALUES (?, ?, ?, ?, ?)').run('session1', 'user1', hashToken('disposable-session'), Date.now(), Date.now() + 60000)
  db.close()
  const probe = net.createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening')
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve))
  const base = `http://127.0.0.1:${port}`
  const child = spawn(process.execPath, ['src/server.js'], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, PORT: String(port), DATABASE_PATH: databasePath, DISCORD_REDIRECT_URI: 'https://public.example/api/auth/discord/callback', GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', AUTH_COOKIE_SECURE: 'false' }, stdio: 'ignore' })
  try {
    let ready = false
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(base + '/api/health')).ok) { ready = true; break } } catch {}
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    assert.ok(ready)
    const headers = { Cookie: 'jukebox_session=disposable-session', 'Content-Type': 'application/json' }
    assert.equal((await fetch(base + '/api/account/youtube')).status, 401)
    assert.equal((await fetch(base + '/api/account/profile', { method: 'PATCH', headers, body: JSON.stringify({ displayName: 'New name' }) })).status, 403)
    const action = { ...headers, Origin: 'https://public.example', 'x-bside-account-action': '1' }
    assert.equal((await fetch(base + '/api/account/profile', { method: 'PATCH', headers: { ...action, Origin: 'https://foreign.example' }, body: JSON.stringify({ displayName: 'Wrong' }) })).status, 403)
    const updated = await fetch(base + '/api/account/profile', { method: 'PATCH', headers: action, body: JSON.stringify({ displayName: 'New name' }) })
    assert.equal(updated.status, 200); assert.equal((await updated.json()).user.displayName, 'New name')
    const session = await fetch(base + '/api/auth/session', { headers })
    assert.equal((await session.json()).user.displayName, 'New name')
    const youtube = await fetch(base + '/api/account/youtube', { headers })
    assert.equal((await youtube.json()).enabled, false)
    assert.equal(youtube.headers.get('cache-control'), 'no-store')
    const bad = await fetch(base + '/api/account', { method: 'DELETE', headers: action, body: JSON.stringify({ confirmation: 'wrong' }) })
    assert.equal(bad.status, 400)
    const removed = await fetch(base + '/api/account', { method: 'DELETE', headers: action, body: JSON.stringify({ confirmation: 'New name' }) })
    assert.equal(removed.status, 204)
    assert.match(removed.headers.get('set-cookie'), /Max-Age=0/)
    assert.equal((await (await fetch(base + '/api/auth/session', { headers })).json()).user, null)
    assert.equal((await fetch(base + '/api/account/youtube', { headers })).status, 401)
  } finally {
    const exited = once(child, 'exit'); child.kill(); await exited
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
