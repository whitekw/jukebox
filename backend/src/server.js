const path = require('node:path')
const http = require('node:http')
const express = require('express')
const { Server } = require('socket.io')
const {
  createDiscordAuth,
  parseCookies,
  safeReturnTo,
  serializeCookie,
  tokensMatch,
} = require('./auth')
const { createDatabase } = require('./db')
const { AppError } = require('./errors')
const { getLocaleConfig } = require('./locale')
const { createRoomPresence } = require('./presence')
const { createRateLimiter } = require('./rate-limit')
const { createRoomService, normalizeCode } = require('./rooms')
const { createYouTubeService } = require('./youtube')

const port = Number(process.env.PORT ?? 3001)
const databasePath = process.env.DATABASE_PATH ?? './data/jukebox.sqlite'
const roomTtlHours = Number(process.env.ROOM_TTL_HOURS ?? 24)
const emptyRoomTtlHours = Number(process.env.EMPTY_ROOM_TTL_HOURS ?? 1)
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
const oauthStateMaxAgeSeconds = 10 * 60

const db = createDatabase(databasePath)
const rooms = createRoomService(db, { roomTtlHours, emptyRoomTtlHours })
const youtube = createYouTubeService(process.env.YOUTUBE_API_KEY)
const auth = createDiscordAuth(db, {
  clientId: process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
  redirectUri: process.env.DISCORD_REDIRECT_URI,
  sessionTtlMs: authSessionTtlMs,
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
}

function addAuthError(returnTo, error) {
  const url = new URL(safeReturnTo(returnTo), 'http://localhost')
  url.searchParams.set('authError', error)
  return `${url.pathname}${url.search}${url.hash}`
}

function roomChannel(code) {
  return `room:${normalizeCode(code)}`
}

function chatRoomChannel(code) {
  return `chat-room:${normalizeCode(code)}`
}

function activeRoomChannel(code) {
  return `active-room:${normalizeCode(code)}`
}

function hostRoomChannel(code) {
  return `host-room:${normalizeCode(code)}`
}

const presence = createRoomPresence({
  graceMs: participantLeaveGraceMs,
  onParticipantOffline: ({ code, participantId }) => {
    try {
      logRoomEvent(
        code,
        'participant_left',
        { participantId },
        {},
      )
      const state = ensureOnlineManagerWithActivity(code)
      emitRoom(code, state)
    } catch (error) {
      if (error?.code !== 'ROOM_NOT_FOUND') {
        console.error('Failed to update participant presence.', error)
      }
    }
  },
})

function withOnlineParticipants(state, additionalParticipantIds = []) {
  const onlineParticipantIds = presence.getParticipantIds(state.code)
  for (const participantId of additionalParticipantIds) {
    onlineParticipantIds.add(participantId)
  }
  return {
    ...state,
    participants: state.participants.filter((participant) =>
      onlineParticipantIds.has(participant.id),
    ),
  }
}

function emitRoom(code, state) {
  const visibleState = withOnlineParticipants(
    state ?? rooms.getPublicRoom(code),
  )
  io.to(roomChannel(code)).emit('room:state', visibleState)
  return visibleState
}

function requestActivityActor(req) {
  const participantToken = req.get('x-participant-token')
  if (participantToken) return { participantToken }
  const hostToken = req.get('x-host-token')
  return hostToken ? { hostToken } : {}
}

function logRoomEvent(code, eventType, actor, data) {
  const normalizedCode = normalizeCode(code)
  const entry = rooms.addRoomEvent(normalizedCode, eventType, actor, data)
  io.to(chatRoomChannel(normalizedCode)).emit('chat:message', entry)
  return entry
}

function ensureOnlineManagerWithActivity(code) {
  const normalizedCode = normalizeCode(code)
  const before = rooms.getPublicRoom(normalizedCode)
  const state = rooms.ensureOnlineManager(
    normalizedCode,
    presence.getParticipantIds(normalizedCode),
  )
  const previousManagerIds = new Set(
    before.participants
      .filter((participant) => participant.isManager)
      .map((participant) => participant.id),
  )
  for (const participant of state.participants) {
    if (participant.isManager && !previousManagerIds.has(participant.id)) {
      logRoomEvent(normalizedCode, 'manager_added', {}, {
        target: participant.nickname,
        automatic: true,
      })
    }
  }
  return state
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
}

function requestAuthUser(req) {
  const cookies = parseCookies(req.get('cookie'))
  return auth.getSessionUser(cookies[authSessionCookie])
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
  res.redirect(302, authorization.url)
})

app.get(
  '/api/auth/discord/callback',
  authLimiter,
  asyncRoute(async (req, res) => {
    const cookies = parseCookies(req.get('cookie'))
    const returnTo = safeReturnTo(cookies[oauthReturnCookie])
    clearOAuthCookies(res)

    if (req.query.error) {
      return res.redirect(302, addAuthError(returnTo, 'cancelled'))
    }
    if (!tokensMatch(req.query.state, cookies[oauthStateCookie])) {
      return res.redirect(302, addAuthError(returnTo, 'invalid_state'))
    }

    try {
      const session = await auth.completeAuthorization(req.query.code)
      appendCookie(res, authSessionCookie, session.sessionToken, {
        maxAge: Math.floor(authSessionTtlMs / 1_000),
        path: '/',
      })
      return res.redirect(302, returnTo)
    } catch (error) {
      if (error?.status >= 500) {
        console.error('Discord authentication failed.', error)
      }
      return res.redirect(302, addAuthError(returnTo, 'failed'))
    }
  }),
)

app.post('/api/auth/logout', mutationLimiter, (req, res) => {
  const cookies = parseCookies(req.get('cookie'))
  auth.deleteSession(cookies[authSessionCookie])
  clearCookie(res, authSessionCookie)
  res.status(204).end()
})

app.post('/api/rooms', mutationLimiter, (req, res) => {
  const user = requestAuthUser(req)
  if (!user) {
    throw new AppError(401, '방을 만들려면 로그인해주세요.', 'AUTH_REQUIRED')
  }
  const nickname = user.displayName.slice(0, 20)
  if (nickname.length < 2 || nickname.length > 20) {
    throw new AppError(400, '닉네임은 2~20자로 입력해주세요.', 'INVALID_NICKNAME')
  }
  const created = rooms.createRoom({
    playbackMode: req.body?.playbackMode,
    retentionMode: 'permanent',
    ownerUserId: user.id,
    nickname,
    participantUserId: user.id,
    profileSource: 'account',
    avatarUrl: user.avatarUrl,
  })
  res.status(201).json(created)
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

app.delete('/api/rooms/:code', mutationLimiter, (req, res) => {
  const user = requestAuthUser(req)
  const normalizedCode = normalizeCode(req.params.code)
  rooms.deleteOwnedRoom(normalizedCode, user?.id)
  io.to(roomChannel(normalizedCode)).emit('room:deleted', {
    code: normalizedCode,
  })
  presence.removeRoom(normalizedCode)
  io.in(roomChannel(normalizedCode)).socketsLeave(roomChannel(normalizedCode))
  io.in(chatRoomChannel(normalizedCode)).socketsLeave(
    chatRoomChannel(normalizedCode),
  )
  io.in(activeRoomChannel(normalizedCode)).socketsLeave(
    activeRoomChannel(normalizedCode),
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
  const result = rooms.joinRoom(req.params.code, req.body)
  emitRoom(req.params.code, result.room)
  res.status(201).json({
    ...result,
    room: withOnlineParticipants(result.room, [result.participant.id]),
  })
})

app.get('/api/rooms/:code/me', (req, res) => {
  res.json(
    rooms.getParticipantStatus(req.params.code, req.get('x-participant-token')),
  )
})

app.get('/api/rooms/:code/messages', (req, res) => {
  res.json({
    items: rooms.listChatMessages(
      req.params.code,
      req.get('x-participant-token'),
    ),
  })
})

app.post('/api/rooms/:code/messages', (req, res) => {
  const normalizedCode = normalizeCode(req.params.code)
  const message = rooms.addChatMessage(
    normalizedCode,
    req.get('x-participant-token'),
    req.body?.content,
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
    const song = await youtube.getVideo(req.body.videoId ?? req.body.input)
    const state = rooms.addSong(
      req.params.code,
      req.get('x-participant-token'),
      song,
    )
    res.status(201).json(emitRoom(req.params.code, state))
  }),
)

app.post('/api/rooms/:code/advance', mutationLimiter, (req, res) => {
  const currentSong = rooms.getPublicRoom(req.params.code).currentSong
  const state = rooms.advance(req.params.code, controlCredentials(req))
  logRoomEvent(
    req.params.code,
    'song_skipped',
    requestActivityActor(req),
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
      requestActivityActor(req),
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
    requestActivityActor(req),
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
      requestActivityActor(req),
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
      requestActivityActor(req),
      { target: target.nickname, automatic: false },
    )
  }
  const state = ensureOnlineManagerWithActivity(normalizedCode)
  res.json(emitRoom(normalizedCode, state))
})

io.on('connection', (socket) => {
  const socketUser = auth.getSessionUser(
    parseCookies(socket.handshake.headers.cookie)[authSessionCookie],
  )

  socket.on('time:sync', (acknowledge) => {
    if (typeof acknowledge === 'function') {
      acknowledge({ serverTime: Date.now() })
    }
  })

  socket.on(
    'room:subscribe',
    ({ code, hostToken, participantToken } = {}, acknowledge) => {
      try {
        const normalizedCode = normalizeCode(code)
        let state = rooms.getPublicRoom(normalizedCode)
        const identity = rooms.getPresenceIdentity(normalizedCode, {
          hostToken,
          participantToken,
          userId: socketUser?.id,
        })
        socket.join(roomChannel(normalizedCode))
        if (identity.isHost || identity.isOwner || identity.participantId) {
          socket.join(activeRoomChannel(normalizedCode))
          rooms.markRoomOccupied(normalizedCode)
        }
        if (identity.isHost) {
          socket.join(hostRoomChannel(normalizedCode))
        }
        if (identity.participantId) {
          socket.join(chatRoomChannel(normalizedCode))
          const becameOnline = presence.connect(
            normalizedCode,
            identity.participantId,
            socket.id,
          )
          socket.data.roomPresence = {
            code: normalizedCode,
            participantId: identity.participantId,
          }
          if (becameOnline) {
            logRoomEvent(
              normalizedCode,
              'participant_joined',
              { participantId: identity.participantId },
              {},
            )
          }
          state = ensureOnlineManagerWithActivity(normalizedCode)
        }
        emitRoom(normalizedCode, state)
        if (typeof acknowledge === 'function') acknowledge({ ok: true })
      } catch (error) {
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
    const roomPresence = socket.data.roomPresence
    if (roomPresence) {
      presence.disconnect(
        roomPresence.code,
        roomPresence.participantId,
        socket.id,
      )
      socket.data.roomPresence = null
    }
    for (const channel of socket.rooms) {
      if (!channel.startsWith('active-room:')) continue
      if (io.sockets.adapter.rooms.get(channel)?.size !== 1) continue
      rooms.markRoomEmpty(channel.slice('active-room:'.length))
    }
  })
})

const frontendDist = path.resolve(__dirname, '../../frontend/dist')
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

rooms.markAllRoomsEmpty()
rooms.deleteExpiredRooms()
auth.deleteExpiredSessions()
const cleanupTimer = setInterval(() => {
  rooms.deleteExpiredRooms()
  auth.deleteExpiredSessions()
}, 60 * 1000)
cleanupTimer.unref()

const playbackTimer = setInterval(() => {
  try {
    for (const state of rooms.advanceCompletedAllDeviceRooms()) {
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
