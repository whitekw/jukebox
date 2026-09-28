const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { createDatabase } = require('../src/db')

const extensionId = 'a'.repeat(32)
const origin = `chrome-extension://${extensionId}`
const redirectUri = `https://${extensionId}.chromiumapp.org/bside`

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

test('Discord callback completes the extension PKCE flow without issuing a website session', { timeout: 10_000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jukebox-extension-login-'))
  const databasePath = path.join(directory, 'jukebox.sqlite')
  const port = await availablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const verifier = 'v'.repeat(48)
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  const state = crypto.randomBytes(32).toString('base64url')
  const child = spawn(process.execPath, ['-r', './test-support/mock-discord.cjs', 'src/server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: databasePath,
      BROWSER_EXTENSION_IDS: extensionId,
      DISCORD_CLIENT_ID: 'test-client',
      DISCORD_CLIENT_SECRET: 'test-secret',
      DISCORD_REDIRECT_URI: `${baseUrl}/api/auth/discord/callback`,
      AUTH_COOKIE_SECURE: 'false',
    },
    stdio: 'ignore',
  })

  let verified = false
  try {
    await waitForServer(baseUrl)
    const start = new URL(`${baseUrl}/api/extension/auth/start`)
    start.searchParams.set('redirect_uri', redirectUri)
    start.searchParams.set('state', state)
    start.searchParams.set('code_challenge', challenge)
    const invalidStart = new URL(start)
    invalidStart.searchParams.set('redirect_uri', 'https://evil.example/collect')
    assert.equal((await fetch(invalidStart)).status, 400)
    const authorization = await fetch(start, { redirect: 'manual' })
    assert.equal(authorization.status, 302)
    const discordUrl = new URL(authorization.headers.get('location'))
    assert.equal(discordUrl.origin, 'https://discord.com')
    const cookies = authorization.headers.getSetCookie()
      .map((cookie) => cookie.split(';')[0])
      .join('; ')

    const callback = new URL(`${baseUrl}/api/auth/discord/callback`)
    callback.searchParams.set('code', 'test-authorization-code')
    callback.searchParams.set('state', discordUrl.searchParams.get('state'))
    const completed = await fetch(callback, {
      headers: { Cookie: cookies },
      redirect: 'manual',
    })
    assert.equal(completed.status, 302)
    const redirect = new URL(completed.headers.get('location'))
    assert.equal(`${redirect.origin}${redirect.pathname}`, redirectUri)
    assert.equal(redirect.searchParams.get('state'), state)
    const grant = redirect.searchParams.get('grant')
    assert.ok(grant)

    const exchange = await fetch(`${baseUrl}/api/extension/auth/exchange`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant, codeVerifier: verifier }),
    })
    assert.equal(exchange.status, 200)
    const { token } = await exchange.json()
    assert.ok(token)
    const profile = await fetch(`${baseUrl}/api/extension/me`, {
      headers: { Origin: origin, Authorization: `Bearer ${token}` },
    })
    assert.equal(profile.status, 200)
    assert.equal((await profile.json()).user.displayName, 'Listener')
    verified = true
  } finally {
    const stopped = child.exitCode === null
      ? new Promise((resolve) => child.once('exit', resolve))
      : Promise.resolve()
    child.kill('SIGTERM')
    await stopped
    if (verified) {
      const db = createDatabase(databasePath)
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM auth_sessions').get().count, 0)
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM extension_sessions').get().count, 1)
      db.close()
    }
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
