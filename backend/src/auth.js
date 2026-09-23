const crypto = require('node:crypto')
const { AppError } = require('./errors')
const { transaction } = require('./db')

const DISCORD_API_BASE = 'https://discord.com/api/v10'
const DISCORD_AUTHORIZE_URL = 'https://discord.com/oauth2/authorize'
const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1_000

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function createToken() {
  return crypto.randomBytes(32).toString('base64url')
}

function publicUser(row) {
  if (!row) return null
  return {
    id: row.id,
    discordId: row.discord_id,
    username: row.username,
    displayName: row.global_name || row.username,
    avatarUrl: row.avatar_hash
      ? `https://cdn.discordapp.com/avatars/${row.discord_id}/${row.avatar_hash}.webp?size=128`
      : null,
  }
}

function parseCookies(header = '') {
  const cookies = {}
  for (const part of String(header).split(';')) {
    const separator = part.indexOf('=')
    if (separator < 0) continue
    const name = part.slice(0, separator).trim()
    if (!name) continue
    const rawValue = part.slice(separator + 1).trim()
    try {
      cookies[name] = decodeURIComponent(rawValue)
    } catch {
      cookies[name] = rawValue
    }
  }
  return cookies
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`]
  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`)
  }
  parts.push(`Path=${options.path ?? '/'}`)
  if (options.httpOnly !== false) parts.push('HttpOnly')
  parts.push(`SameSite=${options.sameSite ?? 'Lax'}`)
  if (options.secure) parts.push('Secure')
  return parts.join('; ')
}

function safeReturnTo(value) {
  if (typeof value !== 'string') return '/'
  if (!value.startsWith('/') || value.startsWith('//')) return '/'
  if (value.includes('\r') || value.includes('\n')) return '/'
  return value
}

function tokensMatch(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  )
}

function createDiscordAuth(db, options = {}) {
  const clientId = String(options.clientId ?? '').trim()
  const clientSecret = String(options.clientSecret ?? '').trim()
  const redirectUri = String(options.redirectUri ?? '').trim()
  const fetchImpl = options.fetchImpl ?? fetch
  const now = options.now ?? Date.now
  const sessionTtlMs = Number.isFinite(options.sessionTtlMs)
    ? options.sessionTtlMs
    : DEFAULT_SESSION_TTL_MS
  const enabled = Boolean(clientId && clientSecret && redirectUri)

  function ensureConfigured() {
    if (!enabled) {
      throw new AppError(
        503,
        'Discord 로그인이 설정되지 않았습니다.',
        'AUTH_NOT_CONFIGURED',
      )
    }
  }

  function createAuthorization() {
    ensureConfigured()
    const state = createToken()
    const url = new URL(DISCORD_AUTHORIZE_URL)
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      scope: 'identify',
      state,
      redirect_uri: redirectUri,
    }).toString()
    return { state, url: url.toString() }
  }

  async function discordRequest(url, init, errorCode) {
    let response
    try {
      response = await fetchImpl(url, {
        ...init,
        signal: init?.signal ?? AbortSignal.timeout(10_000),
      })
    } catch (error) {
      throw new AppError(
        502,
        'Discord에 연결하지 못했습니다.',
        'DISCORD_UNAVAILABLE',
        { cause: error?.message },
      )
    }
    if (!response.ok) {
      throw new AppError(
        502,
        'Discord 인증 요청에 실패했습니다.',
        errorCode,
      )
    }
    return response.json()
  }

  async function completeAuthorization(code) {
    ensureConfigured()
    if (typeof code !== 'string' || !code) {
      throw new AppError(400, 'Discord 인증 코드가 없습니다.', 'INVALID_AUTH_CODE')
    }

    const token = await discordRequest(
      `${DISCORD_API_BASE}/oauth2/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      },
      'DISCORD_TOKEN_ERROR',
    )
    if (typeof token.access_token !== 'string' || !token.access_token) {
      throw new AppError(502, 'Discord 액세스 토큰이 없습니다.', 'DISCORD_TOKEN_ERROR')
    }

    const profile = await discordRequest(
      `${DISCORD_API_BASE}/users/@me`,
      {
        headers: { Authorization: `Bearer ${token.access_token}` },
      },
      'DISCORD_PROFILE_ERROR',
    )
    if (
      typeof profile.id !== 'string' ||
      !profile.id ||
      typeof profile.username !== 'string' ||
      !profile.username
    ) {
      throw new AppError(502, 'Discord 사용자 정보가 올바르지 않습니다.', 'DISCORD_PROFILE_ERROR')
    }

    const signedInAt = now()
    const sessionToken = createToken()
    const user = transaction(db, () => {
      let row = db
        .prepare('SELECT * FROM users WHERE discord_id = ?')
        .get(profile.id)
      if (row) {
        db.prepare(
          `UPDATE users
           SET username = ?, global_name = ?, avatar_hash = ?,
               updated_at = ?, last_login_at = ?
           WHERE id = ?`,
        ).run(
          profile.username,
          profile.global_name ?? null,
          profile.avatar ?? null,
          signedInAt,
          signedInAt,
          row.id,
        )
      } else {
        const userId = crypto.randomUUID()
        db.prepare(
          `INSERT INTO users (
             id, discord_id, username, global_name, avatar_hash,
             created_at, updated_at, last_login_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          userId,
          profile.id,
          profile.username,
          profile.global_name ?? null,
          profile.avatar ?? null,
          signedInAt,
          signedInAt,
          signedInAt,
        )
        row = db.prepare('SELECT * FROM users WHERE id = ?').get(userId)
      }

      row = db.prepare('SELECT * FROM users WHERE id = ?').get(row.id)

      db.prepare(
        `INSERT INTO auth_sessions (
           id, user_id, token_hash, created_at, expires_at
         ) VALUES (?, ?, ?, ?, ?)`,
      ).run(
        crypto.randomUUID(),
        row.id,
        hashToken(sessionToken),
        signedInAt,
        signedInAt + sessionTtlMs,
      )
      return row
    })

    return {
      sessionToken,
      expiresAt: signedInAt + sessionTtlMs,
      user: publicUser(user),
    }
  }

  function getSessionUser(sessionToken) {
    if (typeof sessionToken !== 'string' || !sessionToken) return null
    const currentTime = now()
    const row = db
      .prepare(
        `SELECT users.*
         FROM auth_sessions
         JOIN users ON users.id = auth_sessions.user_id
         WHERE auth_sessions.token_hash = ?
           AND auth_sessions.expires_at > ?`,
      )
      .get(hashToken(sessionToken), currentTime)
    return publicUser(row)
  }

  function deleteSession(sessionToken) {
    if (typeof sessionToken !== 'string' || !sessionToken) return
    db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(
      hashToken(sessionToken),
    )
  }

  function deleteExpiredSessions() {
    return db
      .prepare('DELETE FROM auth_sessions WHERE expires_at <= ?')
      .run(now()).changes
  }

  return {
    enabled,
    createAuthorization,
    completeAuthorization,
    getSessionUser,
    deleteSession,
    deleteExpiredSessions,
  }
}

module.exports = {
  createDiscordAuth,
  hashToken,
  parseCookies,
  safeReturnTo,
  serializeCookie,
  tokensMatch,
}
