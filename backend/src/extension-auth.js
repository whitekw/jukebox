const crypto = require('node:crypto')
const { AppError } = require('./errors')
const { hashToken, publicUser, tokensMatch } = require('./auth')
const { transaction } = require('./db')

const EXTENSION_ID_PATTERN = /^[a-p]{32}$/
const GRANT_TTL_MS = 2 * 60 * 1_000
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1_000

function createExtensionAuth(db, { extensionIds = '', now = Date.now } = {}) {
  const allowedIds = new Set(
    String(extensionIds)
      .split(',')
      .map((id) => id.trim().toLowerCase())
      .filter((id) => EXTENSION_ID_PATTERN.test(id)),
  )

  function extensionIdForOrigin(origin) {
    if (typeof origin !== 'string') return null
    const match = /^chrome-extension:\/\/([a-p]{32})$/.exec(origin)
    return match && allowedIds.has(match[1]) ? match[1] : null
  }

  function isAllowedId(extensionId) {
    return typeof extensionId === 'string' && allowedIds.has(extensionId)
  }

  function validateLogin(redirectUri, state, codeChallenge) {
    if (!allowedIds.size) {
      throw new AppError(503, '브라우저 확장 프로그램 로그인이 설정되지 않았습니다.', 'EXTENSION_NOT_CONFIGURED')
    }
    if (typeof redirectUri !== 'string') {
      throw new AppError(400, '확장 프로그램의 리디렉션 주소가 필요합니다.', 'INVALID_EXTENSION_REDIRECT')
    }
    const match = /^https:\/\/([a-p]{32})\.chromiumapp\.org\/bside$/.exec(redirectUri)
    if (!match || !allowedIds.has(match[1])) {
      throw new AppError(400, '허용되지 않은 확장 프로그램입니다.', 'INVALID_EXTENSION_REDIRECT')
    }
    if (typeof state !== 'string' || !/^[A-Za-z0-9_-]{22,128}$/.test(state)) {
      throw new AppError(400, '로그인 요청 상태가 올바르지 않습니다.', 'INVALID_EXTENSION_STATE')
    }
    if (typeof codeChallenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)) {
      throw new AppError(400, '로그인 요청 검증값이 올바르지 않습니다.', 'INVALID_EXTENSION_CHALLENGE')
    }
    return { extensionId: match[1], redirectUri, state, codeChallenge }
  }

  function createGrant(userId, extensionId, codeChallenge) {
    const grant = crypto.randomBytes(32).toString('base64url')
    db.prepare(
      `INSERT INTO extension_grants
         (token_hash, user_id, extension_id, code_challenge, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(hashToken(grant), userId, extensionId, codeChallenge, now() + GRANT_TTL_MS)
    return grant
  }

  function exchangeGrant(grant, codeVerifier, origin, claimedExtensionId) {
    // Chrome may omit Origin for a privileged extension request. The claim is
    // only useful together with the one-use grant bound to this ID and PKCE.
    const extensionId = origin
      ? extensionIdForOrigin(origin)
      : isAllowedId(claimedExtensionId) ? claimedExtensionId : null
    if (!extensionId || (claimedExtensionId && claimedExtensionId !== extensionId)) {
      throw new AppError(403, '허용되지 않은 확장 프로그램입니다.', 'EXTENSION_FORBIDDEN')
    }
    if (
      typeof grant !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(grant) ||
      typeof codeVerifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(codeVerifier)
    ) {
      throw new AppError(400, '로그인 완료 요청이 올바르지 않습니다.', 'INVALID_EXTENSION_GRANT')
    }

    return transaction(db, () => {
      const row = db.prepare(
        'SELECT * FROM extension_grants WHERE token_hash = ? AND expires_at > ?',
      ).get(hashToken(grant), now())
      const challenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url')
      if (
        !row || row.extension_id !== extensionId ||
        !tokensMatch(row.code_challenge, challenge)
      ) {
        throw new AppError(401, '로그인 요청이 만료되었거나 올바르지 않습니다.', 'EXTENSION_GRANT_INVALID')
      }
      db.prepare('DELETE FROM extension_grants WHERE token_hash = ?').run(hashToken(grant))
      const token = crypto.randomBytes(32).toString('base64url')
      const expiresAt = now() + SESSION_TTL_MS
      db.prepare(
        `INSERT INTO extension_sessions
           (token_hash, user_id, extension_id, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(hashToken(token), row.user_id, extensionId, now(), expiresAt)
      return { token, expiresAt }
    })
  }

  function getSessionUser(token) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null
    const row = db.prepare(
      `SELECT users.*, extension_sessions.extension_id
       FROM extension_sessions
       JOIN users ON users.id = extension_sessions.user_id
       WHERE extension_sessions.token_hash = ? AND extension_sessions.expires_at > ?`,
    ).get(hashToken(token), now())
    return row && allowedIds.has(row.extension_id) ? publicUser(row) : null
  }

  function deleteSession(token) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return
    db.prepare('DELETE FROM extension_sessions WHERE token_hash = ?').run(hashToken(token))
  }

  function deleteExpiredSessions() {
    const currentTime = now()
    db.prepare('DELETE FROM extension_grants WHERE expires_at <= ?').run(currentTime)
    db.prepare('DELETE FROM extension_sessions WHERE expires_at <= ?').run(currentTime)
  }

  return {
    extensionIdForOrigin,
    isAllowedId,
    validateLogin,
    createGrant,
    exchangeGrant,
    getSessionUser,
    deleteSession,
    deleteExpiredSessions,
  }
}

module.exports = { createExtensionAuth }
