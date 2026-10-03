const path = require('node:path')
const http = require('node:http')
const express = require('express')
const { Server } = require('socket.io')
const {
  createDiscordAuth,
  hashToken,
  parseCookies,
  safeReturnTo,
  serializeCookie,
  tokensMatch,
} = require('./auth')
const { createDatabase } = require('./db')
const { AppError } = require('./errors')
const { createExtensionAuth } = require('./extension-auth')
const { getLocaleConfig } = require('./locale')
const { createRoomPresence } = require('./presence')
const { createRateLimiter } = require('./rate-limit')
const { createRoomService, normalizeCode } = require('./rooms')
const { createLibraryService } = require('./library')
const { createYouTubeService } = require('./youtube')
const { createAdminService } = require('./admin')

const port = Number(process.env.PORT ?? 3001)
const databasePath = process.env.DATABASE_PATH ?? './data/jukebox.sqlite'
const configuredParticipantLeaveGraceMs = Number(
  process.env.PARTICIPANT_LEAVE_GRACE_MS ?? 5_000,
)
const participantLeaveGraceMs =
  Number.isFinite(configuredParticipantLeaveGraceMs) &&
  configuredParticipantLeaveGraceMs >= 0
    ? configuredParticipantLeaveGraceMs
    : 5_000
const configuredAuthSessionTtlDays = Number(
  process.env.AUTH_SESSION_TTL_DAYS ?? 30,
)
const authSessionTtlDays =
  Number.isFinite(configuredAuthSessionTtlDays) &&
  configuredAuthSessionTtlDays > 0
    ? configuredAuthSessionTtlDays
    : 30
const authSessionTtlMs = authSessionTtlDays * 24 * 60 * 60 * 1_000
const authCookieSecure = process.env.AUTH_COOKIE_SECURE === undefined
  ? process.env.NODE_ENV === 'production'
  : process.env.AUTH_COOKIE_SECURE === 'true'
const authSessionCookie = 'jukebox_session'
const oauthStateCookie = 'jukebox_oauth_state'
const oauthReturnCookie = 'jukebox_oauth_return_to'
const oauthExtensionFlowCookie = 'jukebox_extension_flow'
const oauthStateMaxAgeSeconds = 10 * 60

const db = createDatabase(databasePath)
const rooms = createRoomService(db)
const library = createLibraryService(db)
rooms.markAllParticipantsOffline()
const youtube = createYouTubeService(process.env.YOUTUBE_API_KEY)
const auth = createDiscordAuth(db, {
  clientId: process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
  redirectUri: process.env.DISCORD_REDIRECT_URI,
  sessionTtlMs: authSessionTtlMs,
})
const extensionAuth = createExtensionAuth(db, {
  extensionIds: process.env.BROWSER_EXTENSION_IDS,
})
const app = express()
const server = http.createServer(app)
const io = new Server(server, { serveClient: false })

if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1)
app.disable('x-powered-by')
app.use(express.json({ limit: '32kb' }))

const searchLimiter = createRateLimiter({ windowMs: 60_000, limit: 30 })
const mutationLimiter = createRateLimiter({ windowMs: 60_000, limit: 120 })
const authLimiter = createRateLimiter({ windowMs: 60_000, limit: 30 })
const chatLimiter = createRateLimiter({
  windowMs: 60_000,
  limit: 30,
  keyForRequest: (req) => {
    const userId = requestAuthUser(req)?.id
    if (userId) return `chat:user:${userId}`
    const token = req.get('x-participant-token')
    return token
      ? `chat:participant:${hashToken(token)}`
      : `chat:ip:${req.ip}`
  },
})

function appendCookie(res, name, value, options = {}) {
  res.append(
    'Set-Cookie',
    serializeCookie(name, value, {
      secure: authCookieSecure,
      ...options,
    }),
  )
}

function clearCookie(res, name, path = '/') {
  appendCookie(res, name, '', { maxAge: 0, path })
}

function clearOAuthCookies(res) {
  clearCookie(res, oauthStateCookie, '/api/auth/discord/callback')
  clearCookie(res, oauthReturnCookie, '/api/auth/discord/callback')
  clearCookie(res, oauthExtensionFlowCookie, '/api/auth/discord/callback')
}

function addAuthError(returnTo, error) {
  const url = new URL(safeReturnTo(returnTo), 'http://localhost')
  url.searchParams.set('authError', error)
  return `${url.pathname}${url.search}${url.hash}`
}

function extensionRedirect(flow, params) {
  const url = new URL(flow.redirectUri)
  url.searchParams.set('state', flow.state)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return url.toString()
}

function readExtensionFlow(value) {
  if (!value) return null
  try {
    const flow = JSON.parse(value)
    return extensionAuth.validateLogin(flow.redirectUri, flow.state, flow.codeChallenge)
  } catch {
    return null
  }
}

function roomChannel(code) {
  return `room:${normalizeCode(code)}`
}

function chatRoomChannel(code) {
  return `chat-room:${normalizeCode(code)}`
}

function hostRoomChannel(code) {
  return `host-room:${normalizeCode(code)}`
}

function participantChannel(participantId) {
  return `participant:${participantId}`
}

function authSessionChannel(sessionToken) {
  return `auth-session:${hashToken(sessionToken)}`
}

const presence = createRoomPresence({
  graceMs: participantLeaveGraceMs,
  onParticipantOffline: ({ code, participantId, offlineSince }) => {
    try {
      rooms.markParticipantOffline(code, participantId, offlineSince)
      emitRoom(code)
    } catch (error) {
      if (error?.code !== 'ROOM_NOT_FOUND') {
        console.error('Failed to update participant presence.', error)
      }
    }
  },
})
const admin = createAdminService(db, {
  discordIds: process.env.ADMIN_DISCORD_IDS,
  onlineCount: (code, participantId) => {
    const ids = presence.getParticipantIds(code)
    return participantId ? Number(ids.has(participantId)) : ids.size
  },
})

function withOnlineParticipants(state, additionalParticipantIds = []) {
  const onlineParticipantIds = presence.getParticipantIds(state.code)
  for (const participantId of additionalParticipantIds) {
    onlineParticipantIds.add(participantId)
  }
  return {
    ...state,
    participants: state.participants
      .filter((participant) => participant.isMember || onlineParticipantIds.has(participant.id))
      .map((participant) => ({
        ...participant,
        online: onlineParticipantIds.has(participant.id),
      })),
  }
}

function emitRoom(code, state) {
  const visibleState = withOnlineParticipants(
    state ?? rooms.getPublicRoom(code),
  )
  io.to(roomChannel(code)).emit('room:state', visibleState)
  return visibleState
}

function requestActivityActor(req, code) {
  const credentials = controlCredentials(req)
  const identity = rooms.getPresenceIdentity(code, credentials)
  if (identity.participantId) {
    return {
      participantToken: credentials.participantToken,
      userId: credentials.userId,
    }
  }
  if (identity.isHost) return { hostToken: credentials.hostToken }
  if (identity.isOwner) return { userId: credentials.userId }
  return {}
}

function logRoomEvent(code, eventType, actor, data) {
  const normalizedCode = normalizeCode(code)
  const entry = rooms.addRoomEvent(normalizedCode, eventType, actor, data)
  io.to(chatRoomChannel(normalizedCode)).emit('chat:message', entry)
  return entry
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
}

function requestAuthUser(req) {
  const cookies = parseCookies(req.get('cookie'))
  return auth.getSessionUser(cookies[authSessionCookie])
}

function requireAuthUser(req) {
  const user = requestAuthUser(req)
  if (!user) throw new AppError(401, '로그인이 필요합니다.', 'AUTH_REQUIRED')
  return user
}

function controlCredentials(req) {
  return {
    hostToken: req.get('x-host-token'),
    participantToken: req.get('x-participant-token'),
    userId: requestAuthUser(req)?.id,
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'jukebox-backend' })
})

app.get('/api/config', (req, res) => {
  res.json(getLocaleConfig(req))
})

app.use('/api/admin', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  try {
    req.adminUser = admin.requireAdmin(requestAuthUser(req))
    next()
  } catch (error) {
    next(error)
  }
})

function requireAdminAction(req) {
  const origin = req.get('origin')
  if (req.get('x-bside-admin-action') !== '1' ||
      (origin && origin !== `${req.protocol}://${req.get('host')}`)) {
    throw new AppError(403, '허용되지 않은 운영 요청입니다.', 'ADMIN_ACTION_FORBIDDEN')
  }
}

app.get('/api/admin/session', (req, res) => {
  res.json({ user: req.adminUser })
})

app.get('/api/admin/overview', (req, res) => {
  res.json({
    ...admin.listOverview(req.query.dayStarts),
    service: {
      uptimeSeconds: Math.floor(process.uptime()),
      discordLoginEnabled: auth.enabled,
      youtubeApiConfigured: Boolean(process.env.YOUTUBE_API_KEY),
    },
  })
})

app.get('/api/admin/rooms', (req, res) => {
  res.json(admin.listRooms(req.query.query, req.query.page))
})

app.get('/api/admin/rooms/:code', (req, res) => {
  res.json(admin.getRoom(req.params.code))
})

app.patch('/api/admin/rooms/:code/playback', mutationLimiter, (req, res) => {
  requireAdminAction(req)
  const code = normalizeCode(req.params.code)
  let action = null
  const state = rooms.setPlaybackPausedAsAdmin(code, req.body?.paused, (paused) => {
    action = paused ? 'room_paused' : 'room_resumed'
    admin.recordAction(req.adminUser, action, 'room', code)
  })
  if (action) {
    logRoomEvent(code, action === 'room_paused' ? 'playback_paused' : 'playback_resumed', {}, {})
  }
  res.json(emitRoom(code, state))
})

app.get('/api/admin/users', (req, res) => {
  res.json(admin.listUsers(req.query.query, req.query.page))
})

app.post('/api/admin/users/:userId/revoke-sessions', mutationLimiter, (req, res) => {
  requireAdminAction(req)
  const hashes = admin.revokeUserSessions(req.adminUser, req.params.userId)
  for (const hash of hashes) io.in(`auth-session:${hash}`).disconnectSockets(true)
  res.json({ revoked: hashes.length })
})

app.get('/api/admin/audit', (req, res) => {
  res.json({ items: admin.listAudit() })
})

app.get('/api/auth/session', (req, res) => {
  const cookies = parseCookies(req.get('cookie'))
  res.json({
    enabled: auth.enabled,
    user: auth.getSessionUser(cookies[authSessionCookie]),
  })
})

app.get('/api/auth/discord', authLimiter, (req, res) => {
  const authorization = auth.createAuthorization()
  const returnTo = safeReturnTo(req.query.returnTo)
  appendCookie(res, oauthStateCookie, authorization.state, {
    maxAge: oauthStateMaxAgeSeconds,
    path: '/api/auth/discord/callback',
  })
  appendCookie(res, oauthReturnCookie, returnTo, {
    maxAge: oauthStateMaxAgeSeconds,
    path: '/api/auth/discord/callback',
  })
  clearCookie(res, oauthExtensionFlowCookie, '/api/auth/discord/callback')
  res.redirect(302, authorization.url)
})

app.get('/api/extension/auth/start', authLimiter, (req, res) => {
  const flow = extensionAuth.validateLogin(
    req.query.redirect_uri,
    req.query.state,
    req.query.code_challenge,
  )
  const authorization = auth.createAuthorization()
  appendCookie(res, oauthStateCookie, authorization.state, {
    maxAge: oauthStateMaxAgeSeconds,
    path: '/api/auth/discord/callback',
  })
  appendCookie(res, oauthExtensionFlowCookie, JSON.stringify(flow), {
    maxAge: oauthStateMaxAgeSeconds,
    path: '/api/auth/discord/callback',
  })
  clearCookie(res, oauthReturnCookie, '/api/auth/discord/callback')
  res.redirect(302, authorization.url)
})

app.get(
  '/api/auth/discord/callback',
  authLimiter,
  asyncRoute(async (req, res) => {
    const cookies = parseCookies(req.get('cookie'))
    const returnTo = safeReturnTo(cookies[oauthReturnCookie])
    const extensionFlow = readExtensionFlow(cookies[oauthExtensionFlowCookie])
    clearOAuthCookies(res)

    function fail(error) {
      return res.redirect(302, extensionFlow
        ? extensionRedirect(extensionFlow, { error })
        : addAuthError(returnTo, error))
    }

    if (req.query.error) {
      return fail('cancelled')
    }
    if (!tokensMatch(req.query.state, cookies[oauthStateCookie])) {
      return fail('invalid_state')
    }

    try {
      const session = await auth.completeAuthorization(req.query.code, {
        createSession: !extensionFlow,
      })
      if (extensionFlow) {
        const grant = extensionAuth.createGrant(
          session.user.id,
          extensionFlow.extensionId,
          extensionFlow.codeChallenge,
        )
        return res.redirect(302, extensionRedirect(extensionFlow, { grant }))
      }
      appendCookie(res, authSessionCookie, session.sessionToken, {
        maxAge: Math.floor(authSessionTtlMs / 1_000),
        path: '/',
      })
      return res.redirect(302, returnTo)
    } catch (error) {
      if (error?.status >= 500) {
        console.error('Discord authentication failed.', error)
      }
      return fail('failed')
    }
  }),
)

app.use('/api/extension', (req, res, next) => {
  const origin = req.get('origin')
  const extensionId = extensionAuth.extensionIdForOrigin(origin)
  const isReadyCheck = req.path === '/auth/ready' && req.method === 'GET'
  const isExtensionOrigin = /^chrome-extension:\/\/[a-p]{32}$/.test(origin ?? '')
  if (origin && !extensionId && !(isReadyCheck && isExtensionOrigin)) {
    return res.status(403).json({
      error: { code: 'EXTENSION_FORBIDDEN', message: '허용되지 않은 확장 프로그램입니다.' },
    })
  }
  if (extensionId || (isReadyCheck && isExtensionOrigin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  }
  if (req.method === 'OPTIONS') return res.status(204).end()
  next()
})

function requireExtensionUser(req, _res, next) {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.get('authorization') ?? '')
  const user = extensionAuth.getSessionUser(match?.[1])
  if (!user) {
    return next(new AppError(401, '확장 프로그램에서 다시 로그인해주세요.', 'EXTENSION_AUTH_REQUIRED'))
  }
  req.extensionUser = user
  req.extensionToken = match[1]
  next()
}

app.get('/api/extension/auth/ready', (req, res) => {
  const origin = req.get('origin')
  res.json({
    enabled: auth.enabled,
    extensionAllowed: origin
      ? Boolean(extensionAuth.extensionIdForOrigin(origin))
      : extensionAuth.isAllowedId(req.query.extension_id),
  })
})

app.post('/api/extension/auth/exchange', authLimiter, (req, res) => {
  const session = extensionAuth.exchangeGrant(
    req.body?.grant,
    req.body?.codeVerifier,
    req.get('origin'),
    req.body?.extensionId,
  )
  res.json(session)
})

app.get('/api/extension/me', requireExtensionUser, (req, res) => {
  res.json({ user: req.extensionUser })
})

app.post('/api/extension/logout', requireExtensionUser, (req, res) => {
  extensionAuth.deleteSession(req.extensionToken)
  res.status(204).end()
})

app.get('/api/extension/rooms', requireExtensionUser, (req, res) => {
  const userId = req.extensionUser.id
  const states = [
    ...rooms.listOwnedRooms(userId),
    ...rooms.listJoinedRooms(userId),
  ]
  res.json({
    items: states.map((state) => ({
      code: state.code,
      currentSongTitle: state.currentSong?.title ?? null,
      queueCount: state.queue.length,
      onlineCount: presence.getParticipantIds(state.code).size,
    })),
  })
})

app.post(
  '/api/extension/rooms/:code/songs',
  requireExtensionUser,
  mutationLimiter,
  asyncRoute(async (req, res) => {
    const userId = req.extensionUser.id
    rooms.assertCanAddSong(req.params.code, null, userId)
    const song = await youtube.getVideo(req.body?.videoId)
    const state = rooms.addSong(req.params.code, null, song, userId)
    res.status(201).json(emitRoom(req.params.code, state))
  }),
)

app.post('/api/auth/logout', mutationLimiter, (req, res) => {
  const cookies = parseCookies(req.get('cookie'))
  const sessionToken = cookies[authSessionCookie]
  auth.deleteSession(sessionToken)
  if (sessionToken) {
    io.in(authSessionChannel(sessionToken)).disconnectSockets(true)
  }
  clearCookie(res, authSessionCookie)
  res.status(204).end()
})

app.post('/api/rooms', mutationLimiter, (req, res) => {
  const user = requestAuthUser(req)
  if (!user) {
    throw new AppError(401, '방을 만들려면 로그인해주세요.', 'AUTH_REQUIRED')
  }
  const nickname = user.displayName.slice(0, 20)
  const created = rooms.createRoom({
    playbackMode: req.body?.playbackMode,
    title: req.body?.title,
    allowGuests: req.body?.allowGuests,
    ownerUserId: user.id,
    nickname,
    participantUserId: user.id,
    profileSource: 'account',
    avatarUrl: user.avatarUrl,
  })
  res.status(201).json(created)
})

app.get('/api/me/playlists', (req, res) => {
  const user = requireAuthUser(req)
  const videoId = typeof req.query.videoId === 'string' ? req.query.videoId : null
  res.json({ items: library.list(user.id, videoId) })
})

app.get('/api/me/saved-videos', (req, res) => {
  const user = requireAuthUser(req)
  res.json({ videoIds: library.listSavedVideoIds(user.id) })
})

app.get('/api/me/playlists/:playlistId/tracks', (req, res) => {
  const user = requireAuthUser(req)
  res.json({ items: library.listTracks(user.id, req.params.playlistId) })
})

app.post('/api/me/playlists', mutationLimiter, (req, res) => {
  const user = requireAuthUser(req)
  res.status(201).json(library.create(user.id, req.body?.name))
})

app.post('/api/me/playlists/:playlistId/reorder', mutationLimiter, (req, res) => {
  const user = requireAuthUser(req)
  res.json({ items: library.reorder(user.id, req.params.playlistId, req.body?.targetIndex) })
})

app.patch('/api/me/playlists/:playlistId', mutationLimiter, (req, res) => {
  const user = requireAuthUser(req)
  res.json(library.rename(user.id, req.params.playlistId, req.body?.name))
})

app.delete('/api/me/playlists/:playlistId', mutationLimiter, (req, res) => {
  const user = requireAuthUser(req)
  res.json(library.remove(user.id, req.params.playlistId))
})

app.put('/api/me/playlists/:playlistId/tracks', mutationLimiter, (req, res) => {
  const user = requireAuthUser(req)
  if (req.body?.videoId !== undefined && req.body?.roomSongId !== undefined) {
    throw new AppError(400, '저장할 곡을 하나만 선택해주세요.', 'INVALID_LIBRARY_SONG')
  }
  res.json(req.body?.videoId !== undefined
    ? library.addExistingTrack(user.id, req.params.playlistId, req.body.videoId)
    : library.addTrack(user.id, req.params.playlistId, req.body?.roomSongId))
})

app.delete('/api/me/playlists/:playlistId/tracks/:videoId', mutationLimiter, (req, res) => {
  const user = requireAuthUser(req)
  res.json(library.removeTrack(user.id, req.params.playlistId, req.params.videoId))
})

app.get('/api/rooms/owned', (req, res) => {
  const user = requestAuthUser(req)
  if (!user) {
    throw new AppError(401, '로그인이 필요합니다.', 'AUTH_REQUIRED')
  }
  res.json({
    items: rooms
      .listOwnedRooms(user.id)
      .map((room) => withOnlineParticipants(room)),
  })
})

app.get('/api/rooms/joined', (req, res) => {
  const user = requestAuthUser(req)
  if (!user) throw new AppError(401, '로그인이 필요합니다.', 'AUTH_REQUIRED')
  res.json({
    items: rooms.listJoinedRooms(user.id).map((room) => withOnlineParticipants(room)),
  })
})

app.delete('/api/rooms/:code', mutationLimiter, (req, res) => {
  const user = requestAuthUser(req)
  const normalizedCode = normalizeCode(req.params.code)
  rooms.deleteOwnedRoom(normalizedCode, user?.id, req.body?.confirmationName)
  io.to(roomChannel(normalizedCode)).emit('room:deleted', {
    code: normalizedCode,
  })
  presence.removeRoom(normalizedCode)
  io.in(roomChannel(normalizedCode)).socketsLeave(roomChannel(normalizedCode))
  io.in(chatRoomChannel(normalizedCode)).socketsLeave(
    chatRoomChannel(normalizedCode),
  )
  res.status(204).end()
})

app.post('/api/rooms/:code/host', mutationLimiter, (req, res) => {
  const normalizedCode = normalizeCode(req.params.code)
  const user = requestAuthUser(req)
  const claimed = rooms.claimHost(normalizedCode, user?.id)

  io.to(hostRoomChannel(normalizedCode)).emit('room:host-revoked')
  io.in(hostRoomChannel(normalizedCode)).socketsLeave(
    hostRoomChannel(normalizedCode),
  )

  res.json({
    hostToken: claimed.hostToken,
    room: emitRoom(normalizedCode, claimed.room),
  })
})

app.get('/api/rooms/:code', (req, res) => {
  res.json(withOnlineParticipants(rooms.getPublicRoom(req.params.code)))
})

app.get('/api/rooms/:code/stats', (req, res) => {
  res.json(rooms.getRoomStats(req.params.code, controlCredentials(req), req.query.timeZone ?? 'UTC'))
})

app.get('/api/rooms/:code/history', (req, res) => {
  res.json(rooms.getRoomHistory(
    req.params.code, controlCredentials(req), req.query.before, req.query.limit ?? 30,
    req.query.requesterId ?? [],
  ))
})

app.get('/api/rooms/:code/autoplay/history-videos', (req, res) => {
  const user = requireAuthUser(req)
  res.json(rooms.listAutoplayHistoryVideos(
    req.params.code, user.id, req.query.q ?? '', req.query.offset ?? 0,
  ))
})

app.get('/api/rooms/:code/session', (req, res) => {
  const session = rooms.getRoomSession(
    req.params.code,
    controlCredentials(req),
  )
  res.json({
    ...session,
    room: withOnlineParticipants(session.room),
  })
})

app.post('/api/rooms/:code/join', mutationLimiter, (req, res) => {
  const user = requestAuthUser(req)
  const result = rooms.joinRoom(req.params.code, {
    nickname: user ? user.displayName.slice(0, 20) : req.body?.nickname,
    userId: user?.id,
    avatarUrl: user?.avatarUrl,
    participantToken: req.get('x-participant-token'),
  })
  emitRoom(req.params.code, result.room)
  res.status(201).json({
    ...result,
    room: withOnlineParticipants(result.room, [result.participant.id]),
  })
})

app.post('/api/rooms/:code/resume', mutationLimiter, (req, res) => {
  const user = requestAuthUser(req)
  const result = rooms.resumeAccountParticipant(req.params.code, user?.id)
  res.json({ ...result, room: withOnlineParticipants(result.room) })
})

app.delete('/api/rooms/:code/membership', mutationLimiter, (req, res) => {
  const user = requestAuthUser(req)
  const code = normalizeCode(req.params.code)
  const result = rooms.leaveAccountRoom(code, user?.id)
  io.to(participantChannel(result.participantId)).emit('room:membership-left')
  presence.removeParticipant(code, result.participantId)
  io.in(participantChannel(result.participantId)).disconnectSockets(true)
  emitRoom(code)
  res.status(204).end()
})

app.get('/api/rooms/:code/me', (req, res) => {
  res.json(
    rooms.getParticipantStatus(req.params.code, req.get('x-participant-token'), requestAuthUser(req)?.id),
  )
})

app.get('/api/rooms/:code/messages', (req, res) => {
  res.json({
    items: rooms.listChatMessages(
      req.params.code,
      req.get('x-participant-token'),
      requestAuthUser(req)?.id,
    ),
  })
})

app.post('/api/rooms/:code/messages', mutationLimiter, chatLimiter, (req, res) => {
  const normalizedCode = normalizeCode(req.params.code)
  const message = rooms.addChatMessage(
    normalizedCode,
    req.get('x-participant-token'),
    req.body?.content,
    requestAuthUser(req)?.id,
  )
  io.to(chatRoomChannel(normalizedCode)).emit('chat:message', message)
  res.status(201).json(message)
})

app.get(
  '/api/youtube/search',
  searchLimiter,
  asyncRoute(async (req, res) => {
    res.json({ items: await youtube.search(req.query.q) })
  }),
)

app.post(
  '/api/rooms/:code/songs',
  mutationLimiter,
  asyncRoute(async (req, res) => {
    const participantToken = req.get('x-participant-token')
    const userId = requestAuthUser(req)?.id
    rooms.assertCanAddSong(req.params.code, participantToken, userId)
    const song = await youtube.getVideo(req.body?.videoId ?? req.body?.input)
    const state = rooms.addSong(
      req.params.code,
      participantToken,
      song,
      requestAuthUser(req)?.id,
    )
    res.status(201).json(emitRoom(req.params.code, state))
  }),
)

app.get('/api/rooms/:code/songs/:songId/vote', (req, res) => {
  res.json(rooms.getSongVote(req.params.code, controlCredentials(req), req.params.songId))
})

app.post('/api/rooms/:code/songs/:songId/vote', mutationLimiter, (req, res) => {
  const state = rooms.setSongVote(
    req.params.code,
    controlCredentials(req),
    req.params.songId,
    req.body?.vote,
  )
  res.json(emitRoom(req.params.code, state))
})

app.post('/api/rooms/:code/advance', mutationLimiter, (req, res) => {
  const currentSong = rooms.getPublicRoom(req.params.code).currentSong
  const state = rooms.advance(req.params.code, controlCredentials(req))
  logRoomEvent(
    req.params.code,
    'song_skipped',
    requestActivityActor(req, req.params.code),
    { title: currentSong?.title ?? '' },
  )
  res.json(emitRoom(req.params.code, state))
})

app.patch('/api/rooms/:code/playback', mutationLimiter, (req, res) => {
  const previousState = rooms.getPublicRoom(req.params.code)
  const state = rooms.setPlaybackPaused(
    req.params.code,
    controlCredentials(req),
    req.body.paused,
  )
  if (previousState.playbackPaused !== state.playbackPaused) {
    logRoomEvent(
      req.params.code,
      state.playbackPaused ? 'playback_paused' : 'playback_resumed',
      requestActivityActor(req, req.params.code),
      {},
    )
  }
  res.json(emitRoom(req.params.code, state))
})

app.post('/api/rooms/:code/playback/start', mutationLimiter, (req, res) => {
  const state = rooms.startPlayback(
    req.params.code,
    controlCredentials(req),
    req.body.videoId,
    req.body.positionSeconds,
  )
  res.json(emitRoom(req.params.code, state))
})

app.patch(
  '/api/rooms/:code/playback/autoplay-blocked',
  mutationLimiter,
  (req, res) => {
    const state = rooms.reportPlaybackBlocked(
      req.params.code,
      req.get('x-host-token'),
      req.body.blocked,
    )
    res.json(emitRoom(req.params.code, state))
  },
)

app.delete('/api/rooms/:code/songs/:songId', mutationLimiter, (req, res) => {
  const removedSong = rooms
    .getPublicRoom(req.params.code)
    .queue.find((song) => song.id === req.params.songId)
  const state = rooms.removeSong(
    req.params.code,
    controlCredentials(req),
    req.params.songId,
  )
  logRoomEvent(
    req.params.code,
    'song_removed',
    requestActivityActor(req, req.params.code),
    { title: removedSong?.title ?? '' },
  )
  res.json(emitRoom(req.params.code, state))
})

app.post('/api/rooms/:code/songs/:songId/reorder', mutationLimiter, (req, res) => {
  const previousQueue = rooms.getPublicRoom(req.params.code).queue
  const previousIndex = previousQueue.findIndex(
    (song) => song.id === req.params.songId,
  )
  const movedSong = previousQueue[previousIndex]
  const state = rooms.reorderSong(
    req.params.code,
    controlCredentials(req),
    req.params.songId,
    req.body.targetIndex,
  )
  if (previousIndex !== Number(req.body.targetIndex)) {
    logRoomEvent(
      req.params.code,
      'queue_reordered',
      requestActivityActor(req, req.params.code),
      {
        title: movedSong?.title ?? '',
        position: Number(req.body.targetIndex) + 1,
      },
    )
  }
  res.json(emitRoom(req.params.code, state))
})

app.patch('/api/rooms/:code/settings', mutationLimiter, (req, res) => {
  const state = rooms.updateRoomSettings(
    req.params.code,
    controlCredentials(req),
    req.body,
  )
  res.json(emitRoom(req.params.code, state))
})

app.post('/api/rooms/:code/autoplay/refresh', mutationLimiter, (req, res) => {
  const state = rooms.refreshAutoplaySuggestions(req.params.code, controlCredentials(req))
  res.json(emitRoom(req.params.code, state))
})

app.patch('/api/rooms/:code/managers/:participantId', mutationLimiter, (req, res) => {
  const normalizedCode = normalizeCode(req.params.code)
  const target = rooms
    .getPublicRoom(normalizedCode)
    .participants.find(
      (participant) => participant.id === req.params.participantId,
    )
  rooms.setManager(
    normalizedCode,
    controlCredentials(req),
    req.params.participantId,
    req.body.isManager,
  )
  if (target && target.isManager !== req.body.isManager) {
    logRoomEvent(
      normalizedCode,
      req.body.isManager ? 'manager_added' : 'manager_removed',
      requestActivityActor(req, normalizedCode),
      { target: target.nickname, automatic: false },
    )
  }
  res.json(emitRoom(normalizedCode))
})

app.post('/api/rooms/:code/participants/:participantId/disconnect', mutationLimiter, (req, res) => {
  const code = normalizeCode(req.params.code)
  const result = rooms.disconnectParticipant(
    code, requestAuthUser(req)?.id, req.params.participantId,
    presence.getParticipantIds(code).has(req.params.participantId),
  )
  io.to(participantChannel(result.participantId)).emit('room:disconnected')
  presence.removeParticipant(code, result.participantId)
  io.in(participantChannel(result.participantId)).disconnectSockets(true)
  res.json(emitRoom(code))
})

io.on('connection', (socket) => {
  const sessionToken = parseCookies(socket.handshake.headers.cookie)[authSessionCookie]
  const socketUser = auth.getSessionUser(sessionToken)
  if (socketUser) socket.join(authSessionChannel(sessionToken))

  const sessionExpiresAt = auth.getSessionExpiresAt(sessionToken)
  let sessionExpiryTimer

  function disconnectExpiredSession() {
    if (sessionExpiresAt === null) return
    const remainingMs = sessionExpiresAt - Date.now()
    if (remainingMs <= 0) {
      socket.disconnect(true)
      return
    }
    sessionExpiryTimer = setTimeout(
      disconnectExpiredSession,
      Math.min(remainingMs, 2_147_483_647),
    )
    sessionExpiryTimer.unref?.()
  }

  function clearRoomSubscription() {
    const previousCode = socket.data.roomCode
    if (!previousCode) return
    const previousPresence = socket.data.roomPresence
    if (previousPresence) {
      presence.disconnect(previousCode, previousPresence.participantId, socket.id)
      socket.leave(participantChannel(previousPresence.participantId))
    }
    socket.leave(roomChannel(previousCode))
    socket.leave(chatRoomChannel(previousCode))
    socket.leave(hostRoomChannel(previousCode))
    socket.data.roomCode = null
    socket.data.roomPresence = null
  }

  disconnectExpiredSession()

  socket.on('time:sync', (acknowledge) => {
    if (typeof acknowledge === 'function') {
      acknowledge({ serverTime: Date.now() })
    }
  })

  socket.on(
    'room:subscribe',
    ({ code, hostToken, participantToken } = {}, acknowledge) => {
      try {
        clearRoomSubscription()
        const normalizedCode = normalizeCode(code)
        let state = rooms.getPublicRoom(normalizedCode)
        const currentUser = auth.getSessionUser(sessionToken)
        const identity = rooms.getPresenceIdentity(normalizedCode, {
          hostToken,
          participantToken,
          userId: currentUser?.id,
        })
        socket.join(roomChannel(normalizedCode))
        socket.data.roomCode = normalizedCode
        if (identity.isHost) {
          socket.join(hostRoomChannel(normalizedCode))
        }
        if (identity.participantId) {
          socket.join(participantChannel(identity.participantId))
          socket.join(chatRoomChannel(normalizedCode))
          presence.connect(
            normalizedCode,
            identity.participantId,
            socket.id,
          )
          rooms.markParticipantOnline(normalizedCode, identity.participantId)
          state = rooms.getPublicRoom(normalizedCode)
          socket.data.roomPresence = {
            code: normalizedCode,
            participantId: identity.participantId,
          }
        }
        emitRoom(normalizedCode, state)
        if (typeof acknowledge === 'function') acknowledge({ ok: true })
      } catch (error) {
        clearRoomSubscription()
        if (typeof acknowledge === 'function') {
          acknowledge({
            ok: false,
            code: error.code,
            details: error.details,
            message: error.message,
          })
        }
      }
    },
  )

  socket.on('disconnecting', () => {
    clearTimeout(sessionExpiryTimer)
    clearRoomSubscription()
  })
})

const frontendDist = path.resolve(__dirname, '../../frontend/dist')
const adminDist = path.resolve(__dirname, '../../admin/dist')
app.use('/admin', express.static(adminDist, { index: false }))
app.get(/^\/admin(?:\/.*)?$/, (req, res, next) => {
  res.sendFile(path.join(adminDist, 'index.html'), (error) => {
    if (error) next()
  })
})
app.use(express.static(frontendDist))
app.get(/.*/, (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io/')) return next()
  res.sendFile(path.join(frontendDist, 'index.html'), (error) => {
    if (error) next()
  })
})

app.use((error, _req, res, _next) => {
  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({
      error: { code: 'INVALID_JSON', message: '요청 형식이 올바르지 않습니다.' },
    })
  }
  const status = error instanceof AppError ? error.status : 500
  const code = error instanceof AppError ? error.code : 'INTERNAL_ERROR'
  if (status >= 500) console.error(error)
  res.status(status).json({
    error: {
      code,
      ...(error instanceof AppError && error.details
        ? { details: error.details }
        : {}),
      message: status >= 500 && !(error instanceof AppError)
        ? '서버에서 요청을 처리하지 못했습니다.'
        : error.message,
    },
  })
})

auth.deleteExpiredSessions()
extensionAuth.deleteExpiredSessions()
const cleanupTimer = setInterval(() => {
  auth.deleteExpiredSessions()
  extensionAuth.deleteExpiredSessions()
}, 60 * 1000)
cleanupTimer.unref()

const playbackTimer = setInterval(() => {
  try {
    for (const state of rooms.advanceCompletedAllDeviceRooms(
      (code) => presence.getParticipantIds(code).size > 0,
    )) {
      emitRoom(state.code, state)
    }
  } catch (error) {
    console.error('Failed to advance completed playback.', error)
  }
}, 500)
playbackTimer.unref()

server.listen(port, () => {
  console.log(`Jukebox backend listening on http://localhost:${port}`)
})

let shuttingDown = false

function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  clearInterval(playbackTimer)
  clearInterval(cleanupTimer)
  presence.clear()

  const forceExitTimer = setTimeout(() => {
    db.close()
    process.exit(1)
  }, 5_000)
  forceExitTimer.unref()

  // server.close()만 호출하면 열려 있는 Socket.IO 연결 때문에 개발 서버의
  // watch 재시작이 끝나지 않아 이전 프로세스가 포트를 계속 점유한다. 실시간 연결과
  // Engine.IO 서버를 먼저 닫은 뒤 DB를 정리해야 다음 프로세스가 즉시 뜬다.
  io.close(() => {
    clearTimeout(forceExitTimer)
    db.close()
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
