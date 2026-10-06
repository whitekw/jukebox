const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { createDatabase } = require('../src/db')
const { createRoomService } = require('../src/rooms')
const { createAdminService } = require('../src/admin')

const track = (videoId = 'early-video', durationSeconds = 180) => ({ videoId, title: videoId, artist: 'Artist', durationSeconds, thumbnailUrl: 'image' })

function fixture(mode = 'host_only') {
  const db = createDatabase()
  db.prepare(`INSERT INTO users (id, discord_id, username, created_at, updated_at, last_login_at)
    VALUES ('owner', '234567890123456789', 'Owner', 1, 1, 1)`).run()
  let clock = Date.now()
  const rooms = createRoomService(db, { now: () => clock })
  const admin = createAdminService(db, { now: () => clock })
  const room = rooms.createRoom({ ownerUserId: 'owner', participantUserId: 'owner', nickname: 'Owner', playbackMode: mode })
  const credentials = mode === 'host_only' ? { hostToken: room.hostToken } : { userId: 'owner' }
  const add = (videoId, duration) => rooms.addSong(room.code, room.participantToken, track(videoId, duration), 'owner').currentSong
  const start = (song) => rooms.startPlayback(room.code, { userId: 'owner' }, song.videoId, 0)
  const skip = (song) => rooms.advance(room.code, credentials, { songId: song.id })
  const stats = () => rooms.getRoomStats(room.code, { userId: 'owner' })
  const advanceClock = (milliseconds) => { clock += milliseconds }
  return { db, rooms, admin, room, credentials, add, start, skip, stats, advanceClock }
}

for (const mode of ['host_only', 'all_devices']) {
  for (const milliseconds of [0, 9999, 10000, 15000]) {
    test(`${mode}: skip after ${milliseconds} ms keeps history and counts only at ten seconds`, () => {
      const { db, rooms, admin, room, add, start, skip, stats, advanceClock } = fixture(mode)
      try {
        const song = add()
        if (mode === 'all_devices') start(song)
        advanceClock(milliseconds)
        const expected = Number(milliseconds >= 10000)
        skip(song)
        assert.equal(stats().totalPlays, expected)
        assert.equal(stats().participants[0].plays, expected)
        assert.equal(stats().daily.reduce((sum, day) => sum + day.count, 0), expected)
        const history = rooms.getRoomHistory(room.code, { userId: 'owner' })
        assert.equal(history.items.length, 1)
        assert.equal(history.items[0].id, song.id)
        assert.equal(history.items[0].countedAsPlay, Boolean(expected))
        // History filter counts describe retained records, rather than stats.
        assert.equal(history.requesters[0].plays, 1)
        assert.equal(admin.listOverview().totals.totalPlays, expected)
        assert.equal(admin.listOverview().totals.playsToday, expected)
        assert.equal(admin.listOverview().daily.reduce((sum, day) => sum + day.plays, 0), expected)
        assert.equal(admin.listRooms(room.code).items[0].playCount, expected)
        assert.equal(admin.listRoomVideos(room.code, song.videoId).items[0].plays, expected)
        assert.equal(rooms.getPublicRoom(room.code).autoplayHistoryCount, expected)
        assert.equal(rooms.getPublicRoom(room.code).autoplayPoolCount, expected)
        assert.equal(createRoomService(db).getRoomStats(room.code, { userId: 'owner' }).totalPlays, expected)
      } finally { db.close() }
    })
  }

  test(`${mode}: paused time does not qualify a short skip`, () => {
    const { db, rooms, room, credentials, add, start, skip, stats, advanceClock } = fixture(mode)
    try {
      const song = add()
      if (mode === 'all_devices') start(song)
      advanceClock(4000)
      rooms.setPlaybackPaused(room.code, credentials, true)
      advanceClock(60000)
      rooms.setPlaybackPaused(room.code, credentials, false)
      advanceClock(5000)
      skip(song)
      assert.equal(stats().totalPlays, 0)
      assert.equal(rooms.getRoomHistory(room.code, { userId: 'owner' }).items[0].countedAsPlay, false)
    } finally { db.close() }
  })
}

test('all-devices pending time is excluded, and its natural short completion still counts', () => {
  const { db, rooms, room, add, start, skip, stats, advanceClock } = fixture('all_devices')
  try {
    const waiting = add('waiting')
    advanceClock(120000)
    start(waiting)
    advanceClock(5000)
    skip(waiting)
    assert.equal(stats().totalPlays, 0)
    const short = add('short', 7)
    start(short)
    advanceClock(7000)
    assert.equal(rooms.advanceCompletedAllDeviceRooms()[0].currentSong, null)
    assert.equal(stats().totalPlays, 1)
    assert.equal(rooms.getRoomHistory(room.code, { userId: 'owner' }).items[0].countedAsPlay, true)
  } finally { db.close() }
})

test('blocked host playback is excluded; a later qualifying play of the same video stays eligible', () => {
  const { db, rooms, room, add, skip, stats, advanceClock } = fixture()
  try {
    const song = add()
    advanceClock(4000)
    rooms.reportPlaybackBlocked(room.code, room.hostToken, true)
    advanceClock(60000)
    skip(song)
    assert.equal(stats().totalPlays, 0)
    const replay = add()
    advanceClock(10000)
    skip(replay)
    assert.equal(stats().totalPlays, 1)
    assert.equal(rooms.getPublicRoom(room.code).autoplayPoolCount, 1)
    assert.deepEqual(rooms.getRoomHistory(room.code, { userId: 'owner' }).items.map(({ countedAsPlay }) => countedAsPlay), [true, false])
  } finally { db.close() }
})

test('a quick skip retains received votes, including a requester who subsequently leaves', () => {
  const { db, rooms, room, skip } = fixture()
  try {
    db.prepare(`INSERT INTO users (id, discord_id, username, created_at, updated_at, last_login_at)
      VALUES ('requester', '345678901234567890', 'Requester', 1, 1, 1)`).run()
    const requester = rooms.joinRoom(room.code, { nickname: 'Requester', userId: 'requester' })
    const listener = rooms.joinRoom(room.code, { nickname: 'Listener' })
    const song = rooms.addSong(room.code, requester.participantToken, track(), 'requester').currentSong
    rooms.setSongVote(room.code, { participantToken: listener.participantToken }, song.id, 'up')
    skip(song)
    rooms.leaveAccountRoom(room.code, 'requester')
    const stats = rooms.getRoomStats(room.code, { participantToken: listener.participantToken })
    assert.equal(stats.totalPlays, 0)
    assert.equal(stats.totalUpvotes, 1)
    const departed = stats.participants.find(({ nickname }) => nickname === 'Requester')
    assert.equal(departed.plays, 0)
    assert.equal(departed.upvotes, 1)
  } finally { db.close() }
})

test('completion reports need the host and exact current request; stale skips cannot affect the next song', () => {
  const { db, rooms, room, credentials, add, skip, stats } = fixture()
  try {
    const short = add('short', 7)
    add('next')
    assert.throws(() => rooms.advance(room.code, { userId: 'owner' }, { reason: 'ended', songId: short.id }), { code: 'HOST_FORBIDDEN' })
    assert.throws(() => rooms.advance(room.code, credentials, { reason: 'ended' }), { code: 'CURRENT_SONG_MISMATCH' })
    assert.throws(() => rooms.advance(room.code, credentials, { reason: 'wrong', songId: short.id }), { code: 'INVALID_ADVANCE_REASON' })
    rooms.advance(room.code, credentials, { reason: 'ended', songId: short.id })
    assert.equal(stats().totalPlays, 2)
    assert.throws(() => skip(short), { code: 'CURRENT_SONG_MISMATCH' })
    assert.equal(stats().totalPlays, 2)
    assert.equal(rooms.getPublicRoom(room.code).currentSong.videoId, 'next')
    assert.equal(rooms.getRoomHistory(room.code, { userId: 'owner' }).items[0].countedAsPlay, true)
  } finally { db.close() }
})

test('advance API distinguishes manual early skips from a host-reported natural ending', { timeout: 15000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jukebox-early-skip-api-'))
  const db = createDatabase(path.join(directory, 'jukebox.sqlite'))
  let child
  try {
    db.prepare(`INSERT INTO users (id, discord_id, username, created_at, updated_at, last_login_at)
      VALUES ('owner', '234567890123456789', 'Owner', 1, 1, 1)`).run()
    const rooms = createRoomService(db)
    const manual = rooms.createRoom({ ownerUserId: 'owner', nickname: 'Owner' })
    const natural = rooms.createRoom({ ownerUserId: 'owner', nickname: 'Owner' })
    const manualSong = rooms.addSong(manual.code, manual.participantToken, track('manual')).currentSong
    const naturalSong = rooms.addSong(natural.code, natural.participantToken, track('short', 7)).currentSong
    db.close()
    const port = await new Promise((resolve, reject) => {
      const probe = net.createServer()
      probe.once('error', reject)
      probe.listen(0, '127.0.0.1', () => { const port = probe.address().port; probe.close(() => resolve(port)) })
    })
    const base = `http://127.0.0.1:${port}`
    child = spawn(process.execPath, ['src/server.js'], {
      cwd: path.resolve(__dirname, '..'), env: { ...process.env, PORT: String(port), DATABASE_PATH: path.join(directory, 'jukebox.sqlite'), YOUTUBE_API_KEY: '' }, stdio: 'ignore',
    })
    let ready = false
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try { if ((await fetch(`${base}/api/health`)).ok) { ready = true; break } } catch { /* Wait for the test server. */ }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    assert.ok(ready, 'test server starts')
    const advance = (room, body, token = room.hostToken) => fetch(`${base}/api/rooms/${room.code}/advance`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-host-token': token }, body: JSON.stringify(body),
    })
    assert.equal((await advance(manual, { songId: crypto.randomUUID() })).status, 409)
    assert.equal((await advance(manual, { songId: manualSong.id })).status, 200)
    assert.equal((await advance(natural, { reason: 'ended', songId: naturalSong.id }, 'wrong')).status, 403)
    assert.equal((await advance(natural, { reason: 'ended', songId: naturalSong.id })).status, 200)
    for (const [room, expected] of [[manual, 0], [natural, 1]]) {
      const headers = { 'x-participant-token': room.participantToken }
      const stats = await (await fetch(`${base}/api/rooms/${room.code}/stats`, { headers })).json()
      assert.equal(stats.totalPlays, expected)
      const history = await (await fetch(`${base}/api/rooms/${room.code}/history`, { headers })).json()
      assert.equal(history.items[0].countedAsPlay, Boolean(expected))
      const historyUrl = `${base}/api/rooms/${room.code}/history`
      const search = new URLSearchParams({ q: history.items[0].videoId.toUpperCase(), requesterId: history.requesters[0].id })
      const filtered = await (await fetch(`${historyUrl}?${search}`, { headers })).json()
      assert.equal(filtered.items[0].id, history.items[0].id)
      const noMatches = await (await fetch(`${historyUrl}?q=no-match`, { headers })).json()
      assert.deepEqual(noMatches.items, [])
      assert.deepEqual(noMatches.requesters, history.requesters)
      assert.equal((await fetch(`${historyUrl}?q=no-match`)).status, 401)
      assert.equal((await fetch(`${historyUrl}?q=a&q=b`, { headers })).status, 400)
      assert.equal((await fetch(`${historyUrl}?q=${'a'.repeat(101)}`, { headers })).status, 400)
      const feed = await (await fetch(`${base}/api/rooms/${room.code}/messages`, { headers })).json()
      assert.equal(feed.items.filter(({ eventType }) => eventType === 'song_skipped').length, Number(room === manual))
    }
  } finally {
    if (db.isOpen) db.close()
    if (child) {
      const stopped = child.exitCode === null ? new Promise((resolve) => child.once('exit', resolve)) : Promise.resolve()
      child.kill('SIGTERM')
      await stopped
    }
    if (path.resolve(directory).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`)) fs.rmSync(directory, { recursive: true, force: true })
  }
})
