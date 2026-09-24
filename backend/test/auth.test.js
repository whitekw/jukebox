const test = require('node:test')
const assert = require('node:assert/strict')
const {
  createDiscordAuth,
  hashToken,
  parseCookies,
  safeReturnTo,
  serializeCookie,
  tokensMatch,
} = require('../src/auth')
const { createDatabase } = require('../src/db')

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

test('creates a Discord authorization URL with state and identify scope', () => {
  const db = createDatabase()
  try {
    const auth = createDiscordAuth(db, {
      clientId: 'client-id',
      clientSecret: 'client-secret',
      redirectUri: 'https://example.com/api/auth/discord/callback',
    })
    const authorization = auth.createAuthorization()
    const url = new URL(authorization.url)

    assert.equal(auth.enabled, true)
    assert.equal(url.origin, 'https://discord.com')
    assert.equal(url.pathname, '/oauth2/authorize')
    assert.equal(url.searchParams.get('client_id'), 'client-id')
    assert.equal(url.searchParams.get('redirect_uri'), 'https://example.com/api/auth/discord/callback')
    assert.equal(url.searchParams.get('scope'), 'identify')
    assert.equal(url.searchParams.get('state'), authorization.state)
    assert.ok(authorization.state.length >= 40)
  } finally {
    db.close()
  }
})

test('exchanges a Discord code and stores only a hashed session token', async () => {
  const db = createDatabase()
  const requests = []
  let currentTime = 1_000
  try {
    const auth = createDiscordAuth(db, {
      clientId: 'client-id',
      clientSecret: 'client-secret',
      redirectUri: 'https://example.com/api/auth/discord/callback',
      sessionTtlMs: 5_000,
      now: () => currentTime,
      fetchImpl: async (url, init) => {
        requests.push({ url, init })
        if (String(url).endsWith('/oauth2/token')) {
          return jsonResponse({ access_token: 'discord-access-token' })
        }
        return jsonResponse({
          id: '123456789',
          username: 'discord-user',
          global_name: 'Music Friend',
          avatar: 'avatar-hash',
        })
      },
    })

    const signedIn = await auth.completeAuthorization('authorization-code')
    assert.deepEqual(signedIn.user, {
      id: signedIn.user.id,
      discordId: '123456789',
      username: 'discord-user',
      displayName: 'Music Friend',
      avatarUrl: 'https://cdn.discordapp.com/avatars/123456789/avatar-hash.webp?size=128',
    })
    assert.equal(signedIn.expiresAt, 6_000)
    assert.equal(requests.length, 2)
    assert.match(String(requests[0].init.body), /grant_type=authorization_code/)
    assert.equal(
      requests[1].init.headers.Authorization,
      'Bearer discord-access-token',
    )

    const storedSession = db
      .prepare('SELECT token_hash FROM auth_sessions')
      .get()
    assert.equal(storedSession.token_hash, hashToken(signedIn.sessionToken))
    assert.notEqual(storedSession.token_hash, signedIn.sessionToken)
    assert.deepEqual(auth.getSessionUser(signedIn.sessionToken), signedIn.user)

    currentTime = 6_000
    assert.equal(auth.getSessionUser(signedIn.sessionToken), null)
    assert.equal(auth.deleteExpiredSessions(), 1)
  } finally {
    db.close()
  }
})

test('updates an existing Discord account instead of duplicating it', async () => {
  const db = createDatabase()
  let loginCount = 0
  try {
    const auth = createDiscordAuth(db, {
      clientId: 'client-id',
      clientSecret: 'client-secret',
      redirectUri: 'https://example.com/api/auth/discord/callback',
      fetchImpl: async (url) => {
        if (String(url).endsWith('/oauth2/token')) {
          return jsonResponse({ access_token: 'discord-access-token' })
        }
        loginCount += 1
        return jsonResponse({
          id: '123456789',
          username: `discord-user-${loginCount}`,
          global_name: null,
          avatar: null,
        })
      },
    })

    const first = await auth.completeAuthorization('first-code')
    const second = await auth.completeAuthorization('second-code')

    assert.equal(first.user.id, second.user.id)
    assert.equal(second.user.username, 'discord-user-2')
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM users').get().count, 1)
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM auth_sessions').get().count, 2)

    auth.deleteSession(second.sessionToken)
    assert.equal(auth.getSessionUser(second.sessionToken), null)
    assert.ok(auth.getSessionUser(first.sessionToken))
  } finally {
    db.close()
  }
})

test('handles auth cookies and return paths safely', () => {
  assert.deepEqual(parseCookies('one=1; encoded=hello%20world'), {
    one: '1',
    encoded: 'hello world',
  })
  assert.equal(
    serializeCookie('session', 'secret', {
      maxAge: 60,
      path: '/',
      secure: true,
    }),
    'session=secret; Max-Age=60; Path=/; HttpOnly; SameSite=Lax; Secure',
  )
  assert.equal(safeReturnTo('/room/ABC234?x=1'), '/room/ABC234?x=1')
  assert.equal(safeReturnTo('https://evil.example'), '/')
  assert.equal(safeReturnTo('//evil.example'), '/')
  assert.equal(safeReturnTo('/\\evil.example'), '/')
  assert.equal(safeReturnTo('/room\\ABC234'), '/')
  assert.equal(safeReturnTo('/room/ABC234?next=\\evil.example'), '/')
  assert.equal(tokensMatch('same-token', 'same-token'), true)
  assert.equal(tokensMatch('same-token', 'other-token'), false)
})

test('reports Discord login as disabled when credentials are incomplete', () => {
  const db = createDatabase()
  try {
    const auth = createDiscordAuth(db, { clientId: 'client-id' })
    assert.equal(auth.enabled, false)
    assert.throws(
      () => auth.createAuthorization(),
      (error) => error.code === 'AUTH_NOT_CONFIGURED' && error.status === 503,
    )
  } finally {
    db.close()
  }
})
