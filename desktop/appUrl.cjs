const DEFAULT_SITE_URL = 'https://bside.whitekw.com'

function siteOrigin(value = DEFAULT_SITE_URL) {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
    || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('BSIDE_APP_URL must be an HTTP(S) origin without a path.')
  }
  return url.origin
}

function isSitePage(value, origin) {
  try {
    return new URL(value).origin === origin
  } catch {
    return false
  }
}

function isAllowedNavigation(value, origin) {
  if (isSitePage(value, origin)) return true
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'discord.com'
  } catch {
    return false
  }
}

function chatNotification(payload) {
  if (!payload || typeof payload !== 'object') return null
  const { roomCode, nickname, content } = payload
  if (typeof roomCode !== 'string' || !/^[A-Z0-9]{6}$/.test(roomCode)) return null
  if (typeof nickname !== 'string' || typeof content !== 'string') return null
  const name = nickname.trim()
  const body = content.trim()
  if (!name || name.length > 20 || !body || body.length > 300) return null
  return { roomCode, nickname: name, content: body }
}

module.exports = { DEFAULT_SITE_URL, siteOrigin, isSitePage, isAllowedNavigation, chatNotification }
