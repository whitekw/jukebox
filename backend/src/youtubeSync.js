const crypto = require('node:crypto')
const { AppError } = require('./errors')
const { transaction } = require('./db')
const { parseIsoDuration } = require('./youtube')
const SCOPE = 'https://www.googleapis.com/auth/youtube.readonly'

function createYouTubeSync(db, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch
  const now = options.now ?? Date.now
  const key = Buffer.from(options.encryptionKey ?? '', 'base64')
  const enabled = Boolean(options.clientId && options.clientSecret && options.redirectUri && key.length === 32)
  const busy = new Set()
  function configured() {
    if (!enabled) throw new AppError(503, 'YouTube 계정 연결이 설정되지 않았습니다.', 'YOUTUBE_SYNC_NOT_CONFIGURED')
  }
  function seal(value) {
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
    const body = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()])
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url')
  }
  function open(value) {
    const bytes = Buffer.from(value, 'base64url')
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12))
    decipher.setAuthTag(bytes.subarray(12, 28))
    return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString())
  }
  async function remote(url, init = {}) {
    let response
    try { response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(15000) }) }
    catch { throw new AppError(502, 'YouTube에 연결하지 못했습니다.', 'YOUTUBE_UNAVAILABLE') }
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new AppError(response.status === 401 || body.error === 'invalid_grant' ? 401 : 502,
      'YouTube 연결을 확인하고 다시 시도해주세요.', body.error === 'invalid_grant' || response.status === 401 ? 'YOUTUBE_RECONNECT_REQUIRED' : 'YOUTUBE_API_ERROR')
    return body
  }
  const tokenRequest = params => remote('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...params, client_id: options.clientId, client_secret: options.clientSecret }),
  })
  function authorization(userId, sessionHash) {
    configured()
    const state = crypto.randomBytes(32).toString('base64url')
    const verifier = crypto.randomBytes(32).toString('base64url')
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    url.search = new URLSearchParams({ client_id: options.clientId, redirect_uri: options.redirectUri,
      response_type: 'code', scope: SCOPE, access_type: 'offline', prompt: 'consent select_account', state,
      code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }).toString()
    return { url: url.toString(), cookie: seal({ userId, sessionHash, state, verifier, expires: now() + 600000 }) }
  }
  async function complete(userId, sessionHash, state, cookie, code) {
    configured()
    let flow
    try { flow = open(cookie) } catch { /* Invalid or expired authorization cookie. */ }
    if (!flow || flow.userId !== userId || flow.sessionHash !== sessionHash || flow.state !== state || flow.expires <= now() || typeof code !== 'string') {
      throw new AppError(403, '인증 요청이 만료되었습니다.', 'INVALID_OAUTH_STATE')
    }
    const token = await tokenRequest({ grant_type: 'authorization_code', code, code_verifier: flow.verifier, redirect_uri: options.redirectUri })
    if (!token.access_token || !token.refresh_token || !(token.scope ?? '').split(' ').includes(SCOPE)) {
      throw new AppError(403, 'YouTube 읽기 권한을 허용해주세요.', 'YOUTUBE_RECONNECT_REQUIRED')
    }
    const channel = await api(token.access_token, 'channels', { mine: 'true', part: 'snippet', maxResults: '1' })
    const item = channel.items?.[0]
    if (!item) throw new AppError(400, 'YouTube 채널을 찾지 못했습니다.', 'YOUTUBE_CHANNEL_REQUIRED')
    transaction(db, () => {
      if (!db.prepare('SELECT id FROM auth_sessions WHERE user_id = ? AND token_hash = ? AND expires_at > ?').get(userId, sessionHash, now())) {
        throw new AppError(403, '인증 요청이 만료되었습니다.', 'INVALID_OAUTH_STATE')
      }
      const previous = db.prepare('SELECT channel_id FROM youtube_connections WHERE user_id = ?').get(userId)
      if (previous && previous.channel_id !== item.id) db.prepare('DELETE FROM youtube_playlist_links WHERE user_id = ?').run(userId)
      db.prepare(`INSERT INTO youtube_connections VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET
        channel_id = excluded.channel_id, channel_title = excluded.channel_title, credentials = excluded.credentials`)
        .run(userId, item.id, item.snippet.title, seal({ access: token.access_token, refresh: token.refresh_token, expires: now() + token.expires_in * 1000 }))
    })
  }
  function connection(userId) {
    configured()
    const row = db.prepare('SELECT * FROM youtube_connections WHERE user_id = ?').get(userId)
    if (!row) throw new AppError(409, '먼저 YouTube 계정을 연결해주세요.', 'YOUTUBE_RECONNECT_REQUIRED')
    return row
  }
  async function access(userId) {
    const row = connection(userId)
    let token
    try { token = open(row.credentials) } catch { throw new AppError(401, 'YouTube 계정을 다시 연결해주세요.', 'YOUTUBE_RECONNECT_REQUIRED') }
    if (token.expires <= now() + 60000) {
      const refreshed = await tokenRequest({ grant_type: 'refresh_token', refresh_token: token.refresh })
      if (!refreshed.access_token) throw new AppError(401, 'YouTube 계정을 다시 연결해주세요.', 'YOUTUBE_RECONNECT_REQUIRED')
      token = { access: refreshed.access_token, refresh: refreshed.refresh_token || token.refresh, expires: now() + refreshed.expires_in * 1000 }
      const changed = db.prepare('UPDATE youtube_connections SET credentials = ? WHERE user_id = ? AND credentials = ?')
        .run(seal(token), userId, row.credentials).changes
      if (!changed) throw new AppError(409, '연결이 변경되었습니다. 다시 시도해주세요.', 'YOUTUBE_SYNC_CHANGED')
    }
    return { token: token.access, channelId: row.channel_id }
  }
  function api(token, path, params) {
    const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`)
    url.search = new URLSearchParams(params).toString()
    return remote(url, { headers: { Authorization: `Bearer ${token}` } })
  }
  function status(userId) {
    const row = db.prepare('SELECT channel_title FROM youtube_connections WHERE user_id = ?').get(userId)
    return { enabled, connected: Boolean(row), channelTitle: row?.channel_title ?? null,
      links: db.prepare(`SELECT youtube_id AS youtubeId, playlist_id AS playlistId, playlists.name,
        synced_at AS syncedAt, skipped_count AS skippedCount FROM youtube_playlist_links JOIN playlists ON playlists.id = playlist_id WHERE user_id = ?`).all(userId) }
  }
  async function list(userId, pageToken = '') {
    const { token } = await access(userId)
    if (typeof pageToken !== 'string' || pageToken.length > 1024) throw new AppError(400, '페이지가 올바르지 않습니다.', 'INVALID_YOUTUBE_SELECTION')
    const result = await api(token, 'playlists', { mine: 'true', part: 'snippet,contentDetails', maxResults: '50', ...(pageToken ? { pageToken } : {}) })
    return { items: (result.items ?? []).map(p => ({ id: p.id, title: p.snippet.title, trackCount: p.contentDetails.itemCount,
      thumbnailUrl: p.snippet.thumbnails?.medium?.url ?? null })), nextPageToken: result.nextPageToken ?? null }
  }
  async function sync(userId, ids) {
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 20 || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !/^[\w-]{10,100}$/.test(id))) {
      throw new AppError(400, '재생목록을 1~20개 선택해주세요.', 'INVALID_YOUTUBE_SELECTION')
    }
    if (busy.has(userId)) throw new AppError(409, '동기화가 진행 중입니다.', 'YOUTUBE_SYNC_BUSY')
    busy.add(userId)
    try {
      const { token, channelId } = await access(userId)
      const credentials = connection(userId).credentials
      const initialLinks = new Map(db.prepare('SELECT youtube_id, playlist_id FROM youtube_playlist_links WHERE user_id = ?').all(userId).map(r => [r.youtube_id, r.playlist_id]))
      const source = await api(token, 'playlists', { id: ids.join(','), part: 'snippet', maxResults: '50' })
      if (source.items?.length !== ids.length || source.items.some(p => p.snippet.channelId !== channelId)) {
        throw new AppError(403, '본인 재생목록만 가져올 수 있습니다.', 'INVALID_YOUTUBE_SELECTION')
      }
      const prepared = []
      for (const playlist of source.items) {
        let pageToken = ''
        const videoIds = []
        const pages = new Set()
        do {
          if (pages.has(pageToken)) throw new AppError(502, 'YouTube 페이지를 불러오지 못했습니다.', 'YOUTUBE_API_ERROR')
          pages.add(pageToken)
          const page = await api(token, 'playlistItems', { playlistId: playlist.id, part: 'contentDetails', maxResults: '50', ...(pageToken ? { pageToken } : {}) })
          videoIds.push(...(page.items ?? []).map(i => i.contentDetails.videoId))
          pageToken = page.nextPageToken ?? ''
          if (videoIds.length > 5000) throw new AppError(400, '재생목록은 최대 5,000곡까지 가져올 수 있습니다.', 'YOUTUBE_PLAYLIST_TOO_LARGE')
        } while (pageToken)
        const unique = [...new Set(videoIds)].filter(id => /^[\w-]{11}$/.test(id))
        const videos = new Map()
        for (let i = 0; i < unique.length; i += 50) {
          const data = await api(token, 'videos', { id: unique.slice(i, i + 50).join(','), part: 'snippet,contentDetails,status', maxResults: '50' })
          for (const v of data.items ?? []) if (v.status?.embeddable && v.status?.privacyStatus === 'public' && v.snippet?.liveBroadcastContent !== 'live') videos.set(v.id, v)
        }
        prepared.push({ playlist, videos: unique.map(id => videos.get(id)).filter(Boolean), skipped: videoIds.length - videos.size })
      }
      transaction(db, () => {
        if (connection(userId).credentials !== credentials) throw new AppError(409, '연결이 변경되었습니다.', 'YOUTUBE_SYNC_CHANGED')
        for (const { playlist, videos, skipped } of prepared) {
          const link = db.prepare('SELECT playlist_id FROM youtube_playlist_links WHERE user_id = ? AND youtube_id = ?').get(userId, playlist.id)
          if (link?.playlist_id !== initialLinks.get(playlist.id)) throw new AppError(409, '동기화 연결이 변경되었습니다.', 'YOUTUBE_SYNC_CHANGED')
          const id = link?.playlist_id ?? crypto.randomUUID()
          const time = now()
          const name = playlist.snippet.title.trim().slice(0, 60) || 'YouTube'
          if (!link) {
            const position = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM playlists WHERE owner_user_id = ?').get(userId).next
            db.prepare("INSERT INTO playlists (id, owner_user_id, name, kind, position, created_at, updated_at) VALUES (?, ?, ?, 'custom', ?, ?, ?)").run(id, userId, name, position, time, time)
          } else db.prepare('UPDATE playlists SET name = ?, updated_at = ? WHERE id = ?').run(name, time, id)
          db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ?').run(id)
          videos.forEach((v, i) => {
            db.prepare(`INSERT INTO library_tracks VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(video_id) DO UPDATE SET
              title = excluded.title, artist = excluded.artist, duration_seconds = excluded.duration_seconds, thumbnail_url = excluded.thumbnail_url, updated_at = excluded.updated_at`)
              .run(v.id, v.snippet.title, v.snippet.channelTitle, parseIsoDuration(v.contentDetails.duration), v.snippet.thumbnails?.medium?.url ?? `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`, time)
            db.prepare('INSERT INTO playlist_tracks VALUES (?, ?, ?)').run(id, v.id, time - i)
          })
          db.prepare(`INSERT INTO youtube_playlist_links VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, youtube_id) DO UPDATE SET
            synced_at = excluded.synced_at, skipped_count = excluded.skipped_count`).run(userId, playlist.id, id, time, skipped)
        }
      })
      return status(userId)
    } finally { busy.delete(userId) }
  }
  async function disconnect(userId) {
    const row = db.prepare('SELECT credentials FROM youtube_connections WHERE user_id = ?').get(userId)
    db.prepare('DELETE FROM youtube_playlist_links WHERE user_id = ?').run(userId)
    db.prepare('DELETE FROM youtube_connections WHERE user_id = ?').run(userId)
    if (row && enabled) {
      try {
        const token = open(row.credentials)
        await fetchImpl('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: token.refresh }), signal: AbortSignal.timeout(10000) })
      } catch { /* Local credentials are removed even if Google is unavailable. */ }
    }
  }
  function unlink(userId, youtubeId) { db.prepare('DELETE FROM youtube_playlist_links WHERE user_id = ? AND youtube_id = ?').run(userId, youtubeId); return status(userId) }
  return { enabled, authorization, complete, status, list, sync, disconnect, unlink }
}
module.exports = { createYouTubeSync }
