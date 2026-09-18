const path = require('node:path')
const http = require('node:http')
const express = require('express')
const { Server } = require('socket.io')
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

const db = createDatabase(databasePath)
const rooms = createRoomService(db, { roomTtlHours, emptyRoomTtlHours })
const youtube = createYouTubeService(process.env.YOUTUBE_API_KEY)
const app = express()
const server = http.createServer(app)
const io = new Server(server, { serveClient: false })

if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1)
app.disable('x-powered-by')
app.use(express.json({ limit: '32kb' }))

const searchLimiter = createRateLimiter({ windowMs: 60_000, limit: 30 })
const mutationLimiter = createRateLimiter({ windowMs: 60_000, limit: 120 })

function roomChannel(code) {
  return `room:${normalizeCode(code)}`
}

function activeRoomChannel(code) {
  return `active-room:${normalizeCode(code)}`
}

const presence = createRoomPresence({
  graceMs: participantLeaveGraceMs,
  onParticipantOffline: ({ code }) => {
    try {
      const state = rooms.ensureOnlineManager(
        code,
        presence.getParticipantIds(code),
      )
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

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
}

function controlCredentials(req) {
  return {
    hostToken: req.get('x-host-token'),
    participantToken: req.get('x-participant-token'),
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'jukebox-backend' })
})

app.get('/api/config', (req, res) => {
  res.json(getLocaleConfig(req))
})

app.post('/api/rooms', mutationLimiter, (req, res) => {
  const created = rooms.createRoom(req.body)
  res.status(201).json(created)
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
  const state = rooms.advance(req.params.code, controlCredentials(req))
  res.json(emitRoom(req.params.code, state))
})

app.patch('/api/rooms/:code/playback', mutationLimiter, (req, res) => {
  const state = rooms.setPlaybackPaused(
    req.params.code,
    controlCredentials(req),
    req.body.paused,
  )
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
  const state = rooms.removeSong(
    req.params.code,
    controlCredentials(req),
    req.params.songId,
  )
  res.json(emitRoom(req.params.code, state))
})

app.post('/api/rooms/:code/songs/:songId/reorder', mutationLimiter, (req, res) => {
  const state = rooms.reorderSong(
    req.params.code,
    controlCredentials(req),
    req.params.songId,
    req.body.targetIndex,
  )
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

app.post('/api/rooms/:code/manager/transfer', mutationLimiter, (req, res) => {
  const normalizedCode = normalizeCode(req.params.code)
  const targetParticipantId = String(req.body.targetParticipantId ?? '')
  if (!presence.getParticipantIds(normalizedCode).has(targetParticipantId)) {
    throw new AppError(
      409,
      '현재 접속 중인 참여자에게만 관리 권한을 넘길 수 있습니다.',
      'PARTICIPANT_OFFLINE',
    )
  }
  const state = rooms.transferManager(
    normalizedCode,
    req.get('x-participant-token'),
    targetParticipantId,
  )
  res.json(emitRoom(normalizedCode, state))
})

io.on('connection', (socket) => {
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
        })
        socket.join(roomChannel(normalizedCode))
        if (identity.isHost || identity.participantId) {
          socket.join(activeRoomChannel(normalizedCode))
          rooms.markRoomOccupied(normalizedCode)
        }
        if (identity.participantId) {
          presence.connect(
            normalizedCode,
            identity.participantId,
            socket.id,
          )
          socket.data.roomPresence = {
            code: normalizedCode,
            participantId: identity.participantId,
          }
          state = rooms.ensureOnlineManager(
            normalizedCode,
            presence.getParticipantIds(normalizedCode),
          )
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
const cleanupTimer = setInterval(() => rooms.deleteExpiredRooms(), 60 * 1000)
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

function shutdown() {
  clearInterval(playbackTimer)
  clearInterval(cleanupTimer)
  presence.clear()
  server.close(() => {
    db.close()
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
