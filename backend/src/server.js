const path = require('node:path')
const http = require('node:http')
const express = require('express')
const { Server } = require('socket.io')
const { createDatabase } = require('./db')
const { AppError } = require('./errors')
const { getLocaleConfig } = require('./locale')
const { createRateLimiter } = require('./rate-limit')
const { createRoomService, normalizeCode } = require('./rooms')
const { createYouTubeService } = require('./youtube')

const port = Number(process.env.PORT ?? 3001)
const databasePath = process.env.DATABASE_PATH ?? './data/jukebox.sqlite'
const roomTtlHours = Number(process.env.ROOM_TTL_HOURS ?? 24)
const youtubeDefaultRegion = process.env.YOUTUBE_DEFAULT_REGION ?? 'KR'

const db = createDatabase(databasePath)
const rooms = createRoomService(db, { roomTtlHours })
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

function emitRoom(code, state) {
  io.to(roomChannel(code)).emit('room:state', state ?? rooms.getPublicRoom(code))
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
  res.json(rooms.getPublicRoom(req.params.code))
})

app.post('/api/rooms/:code/join', mutationLimiter, (req, res) => {
  const result = rooms.joinRoom(req.params.code, req.body)
  emitRoom(req.params.code, result.room)
  res.status(201).json(result)
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

app.get(
  '/api/youtube/charts/music',
  searchLimiter,
  asyncRoute(async (req, res) => {
    const { countryCode } = getLocaleConfig(req)
    res.json(await youtube.getPopularMusic(countryCode, youtubeDefaultRegion))
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
    emitRoom(req.params.code, state)
    res.status(201).json(state)
  }),
)

app.post('/api/rooms/:code/advance', mutationLimiter, (req, res) => {
  const state = rooms.advance(req.params.code, controlCredentials(req))
  emitRoom(req.params.code, state)
  res.json(state)
})

app.patch('/api/rooms/:code/playback', mutationLimiter, (req, res) => {
  const state = rooms.setPlaybackPaused(
    req.params.code,
    controlCredentials(req),
    req.body.paused,
  )
  emitRoom(req.params.code, state)
  res.json(state)
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
    emitRoom(req.params.code, state)
    res.json(state)
  },
)

app.delete('/api/rooms/:code/songs/:songId', mutationLimiter, (req, res) => {
  const state = rooms.removeSong(
    req.params.code,
    controlCredentials(req),
    req.params.songId,
  )
  emitRoom(req.params.code, state)
  res.json(state)
})

app.post('/api/rooms/:code/songs/:songId/move', mutationLimiter, (req, res) => {
  const state = rooms.moveSong(
    req.params.code,
    controlCredentials(req),
    req.params.songId,
    req.body.direction,
  )
  emitRoom(req.params.code, state)
  res.json(state)
})

app.patch('/api/rooms/:code/settings', mutationLimiter, (req, res) => {
  const state = rooms.updateRoomSettings(
    req.params.code,
    controlCredentials(req),
    req.body,
  )
  emitRoom(req.params.code, state)
  res.json(state)
})

app.post('/api/rooms/:code/manager/transfer', mutationLimiter, (req, res) => {
  const state = rooms.transferManager(
    req.params.code,
    req.get('x-participant-token'),
    req.body.targetParticipantId,
  )
  emitRoom(req.params.code, state)
  res.json(state)
})

io.on('connection', (socket) => {
  socket.on('time:sync', (acknowledge) => {
    if (typeof acknowledge === 'function') {
      acknowledge({ serverTime: Date.now() })
    }
  })

  socket.on('room:subscribe', ({ code } = {}, acknowledge) => {
    try {
      const normalizedCode = normalizeCode(code)
      const state = rooms.getPublicRoom(normalizedCode)
      socket.join(roomChannel(normalizedCode))
      socket.emit('room:state', state)
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

rooms.deleteExpiredRooms()
const cleanupTimer = setInterval(() => rooms.deleteExpiredRooms(), 15 * 60 * 1000)
cleanupTimer.unref()

server.listen(port, () => {
  console.log(`Jukebox backend listening on http://localhost:${port}`)
})

function shutdown() {
  server.close(() => {
    db.close()
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
