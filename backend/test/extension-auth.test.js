const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { createDatabase } = require('../src/db')
const { createExtensionAuth } = require('../src/extension-auth')
const { hashToken } = require('../src/auth')

const extensionId = 'a'.repeat(32)
const origin = `chrome-extension://${extensionId}`
const redirectUri = `https://${extensionId}.chromiumapp.org/bside`
const verifier = 'v'.repeat(48)
const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')

function createUser(db) {
  const id = crypto.randomUUID()
  db.prepare(
    `INSERT INTO users (id, discord_id, username, global_name, avatar_hash,
      created_at, updated_at, last_login_at)
     VALUES (?, ?, 'listener', 'Listener', NULL, 1, 1, 1)`,
  ).run(id, id)
  return id
}

test('only grants extension login to configured redirect IDs', () => {
  const db = createDatabase()
  try {
    const auth = createExtensionAuth(db, { extensionIds: extensionId })
    assert.deepEqual(auth.validateLogin(redirectUri, 's'.repeat(43), challenge), {
      extensionId, redirectUri, state: 's'.repeat(43), codeChallenge: challenge,
    })
    assert.equal(auth.extensionIdForOrigin(origin), extensionId)
    assert.equal(auth.extensionIdForOrigin('chrome-extension://' + 'b'.repeat(32)), null)
    assert.throws(
      () => auth.validateLogin('https://evil.example/bside', 's'.repeat(43), challenge),
      (error) => error.code === 'INVALID_EXTENSION_REDIRECT',
    )
    assert.throws(
      () => auth.validateLogin(`${redirectUri}?next=https://evil.example`, 's'.repeat(43), challenge),
      (error) => error.code === 'INVALID_EXTENSION_REDIRECT',
    )
  } finally {
    db.close()
  }
})

test('exchanges a one-use grant for a revocable account-only extension token', () => {
  const db = createDatabase()
  let currentTime = 1_000
  try {
    const userId = createUser(db)
    const auth = createExtensionAuth(db, {
      extensionIds: extensionId,
      now: () => currentTime,
    })
    const grant = auth.createGrant(userId, extensionId, challenge)
    assert.equal(db.prepare('SELECT token_hash FROM extension_grants').get().token_hash, hashToken(grant))
    assert.throws(
      () => auth.exchangeGrant(grant, 'x'.repeat(48), origin),
      (error) => error.code === 'EXTENSION_GRANT_INVALID',
    )
    assert.throws(
      () => auth.exchangeGrant(grant, verifier, 'chrome-extension://' + 'b'.repeat(32)),
      (error) => error.code === 'EXTENSION_FORBIDDEN',
    )
    assert.throws(
      () => auth.exchangeGrant(grant, verifier, origin, 'b'.repeat(32)),
      (error) => error.code === 'EXTENSION_FORBIDDEN',
    )
    assert.throws(
      () => auth.exchangeGrant(grant, verifier, undefined, 'b'.repeat(32)),
      (error) => error.code === 'EXTENSION_FORBIDDEN',
    )
    const session = auth.exchangeGrant(grant, verifier, undefined, extensionId)
    assert.equal(db.prepare('SELECT token_hash FROM extension_sessions').get().token_hash, hashToken(session.token))
    assert.equal(auth.getSessionUser(session.token).id, userId)
    assert.throws(
      () => auth.exchangeGrant(grant, verifier, origin),
      (error) => error.code === 'EXTENSION_GRANT_INVALID',
    )
    auth.deleteSession(session.token)
    assert.equal(auth.getSessionUser(session.token), null)

    const expiringGrant = auth.createGrant(userId, extensionId, challenge)
    currentTime += 2 * 60 * 1_000
    assert.throws(
      () => auth.exchangeGrant(expiringGrant, verifier, origin),
      (error) => error.code === 'EXTENSION_GRANT_INVALID',
    )
    auth.deleteExpiredSessions()
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM extension_grants').get().count, 0)
  } finally {
    db.close()
  }
})
