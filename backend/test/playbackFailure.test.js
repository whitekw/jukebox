const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { createDatabase } = require('../src/db')
const { createRoomService } = require('../src/rooms')

function fixture(playbackMode = 'host_only', databasePath = ':memory:') {
  const db = createDatabase(databasePath)
  db.prepare(`INSERT INTO users (id, discord_id, username, created_at, updated_at, last_login_at)
    VALUES ('owner', 'discord-owner', 'Owner', 1, 1, 1)`).run()
  const rooms = createRoomService(db)
  const created = rooms.createRoom({ ownerUserId: 'owner', nickname: 'Host', playbackMode })
  const guest = rooms.joinRoom(created.code, { nickname: 'Guest' })
  const reporter = rooms.joinRoom(created.code, { nickname: 'Listener' })
  const credentials = playbackMode === 'host_only'
    ? { hostToken: created.hostToken }
    : { participantToken: reporter.participantToken }
  const add = (videoId) => rooms.addSong(created.code, guest.participantToken, {
    videoId, title: videoId, artist: 'Artist', durationSeconds: 180, thumbnailUrl: 'image',
  })
  const report = (state, errorCode = 101, overrides = {}, auth = credentials) =>
    rooms.reportPlaybackFailure(created.code, auth, {
      songId: state.currentSong.id, videoId: state.currentSong.videoId, errorCode, ...overrides,
    })
  return { db, rooms, created, guest, reporter, add, report, credentials }
}

for (const playbackMode of ['host_only', 'all_devices']) {
  for (const errorCode of [100, 101, 150]) {
    test(`${playbackMode} skips YouTube error ${errorCode} without history or playback stats`, () => {
      const { db, rooms, created, guest, reporter, add, report } = fixture(playbackMode)
      try {
        const failed = add('unavailable')
        add('next')
        rooms.setSongVote(created.code, { participantToken: reporter.participantToken }, failed.currentSong.id, 'down')
        const next = report(failed, errorCode)
        assert.equal(next.currentSong.videoId, 'next')
        assert.equal(next.queue.length, 0)
        assert.equal(next.playbackRevision, failed.playbackRevision + 1)
        assert.equal(next.playbackPending, playbackMode === 'all_devices')
        assert.equal(next.playbackPaused, false)
        assert.equal(next.playbackBlocked, false)
        const stored = db.prepare('SELECT status, started_at, playback_error_code FROM songs WHERE id = ?')
          .get(failed.currentSong.id)
        assert.deepEqual({ ...stored }, { status: 'removed', started_at: null, playback_error_code: errorCode })
        const participantAuth = { participantToken: guest.participantToken }
        assert.deepEqual(rooms.getRoomHistory(created.code, participantAuth).items, [])
        const stats = rooms.getRoomStats(created.code, participantAuth)
        assert.equal(stats.totalPlays, 1)
        assert.equal(stats.totalDownvotes, 0)
        assert.equal(next.autoplayHistoryCount, 0)
        // Reports from several devices must not skip the next song.
        assert.equal(report(failed, errorCode).currentSong.id, next.currentSong.id)
        assert.equal(report(failed, errorCode).playbackRevision, next.playbackRevision)
      } finally {
        db.close()
      }
    })
  }
}

test('a failure with an empty queue clears playback and never resurrects the failed record', () => {
  const { db, rooms, created, guest, add, report } = fixture()
  try {
    const failed = add('unavailable')
    const empty = report(failed)
    assert.equal(empty.currentSong, null)
    assert.equal(empty.playbackPending, false)
    assert.equal(rooms.getRoomStats(created.code, { participantToken: guest.participantToken }).totalPlays, 0)
    assert.equal(report(failed).currentSong, null)
    const retried = add('unavailable')
    assert.notEqual(retried.currentSong.id, failed.currentSong.id)
    assert.equal(report(failed).currentSong.id, retried.currentSong.id)
    assert.equal(report(retried, 101, { videoId: 'different-video' }).currentSong.id, retried.currentSong.id)
  } finally {
    db.close()
  }
})

test('only the playback host reports host-only failures; all-devices reports need a room session', () => {
  for (const playbackMode of ['host_only', 'all_devices']) {
    const { db, created, guest, add, report } = fixture(playbackMode)
    try {
      const failed = add('unavailable')
      assert.throws(() => report(failed, 101, {}, {}), {
        code: playbackMode === 'host_only' ? 'HOST_FORBIDDEN' : 'PARTICIPANT_REQUIRED',
      })
      if (playbackMode === 'host_only') {
        for (const auth of [{ userId: 'owner' }, { participantToken: guest.participantToken }]) {
          assert.throws(() => report(failed, 101, {}, auth), { code: 'HOST_FORBIDDEN' })
        }
      }
      for (const errorCode of [2, 5, 153, -1, '101', null]) {
        assert.throws(() => report(failed, errorCode), { code: 'INVALID_PLAYBACK_STATE' })
      }
      assert.throws(() => report(failed, 101, { songId: '' }), { code: 'INVALID_PLAYBACK_STATE' })
      assert.throws(() => report(failed, 101, { videoId: '' }), { code: 'INVALID_PLAYBACK_STATE' })
    } finally {
      db.close()
    }
  }
})

test('failed historical videos leave the autoplay pool and stay excluded after service restart', () => {
  const { db, rooms, created, guest, add, report } = fixture()
  try {
    for (let index = 0; index < 10; index += 1) {
      add(`history-${index}`)
      rooms.advance(created.code, { hostToken: created.hostToken }, { reason: 'ended', songId: rooms.getPublicRoom(created.code).currentSong.id })
    }
    const enabled = rooms.updateRoomSettings(created.code, { userId: 'owner' }, { historyAutoplay: true })
    const failedVideo = enabled.currentSong.videoId
    const next = report(enabled)
    assert.notEqual(next.currentSong.videoId, failedVideo)
    assert.equal(next.autoplayPoolCount, 9)
    assert.ok(next.autoplaySuggestions.every(({ videoId }) => videoId !== failedVideo))
    // Previous successful plays are retained; the failed autoplay occurrence is omitted.
    assert.equal(rooms.getRoomHistory(created.code, { participantToken: guest.participantToken }).items.length, 10)
    const restarted = createRoomService(db).getPublicRoom(created.code)
    assert.equal(restarted.autoplayPoolCount, 9)
    assert.ok(restarted.autoplaySuggestions.every(({ videoId }) => videoId !== failedVideo))
  } finally {
    db.close()
  }
})

test('autoplay stops when its only historical video becomes unavailable', () => {
  const { db, rooms, created, add, report } = fixture()
  try {
    for (let index = 0; index < 10; index += 1) {
      add('only-video')
      rooms.advance(created.code, { hostToken: created.hostToken }, { reason: 'ended', songId: rooms.getPublicRoom(created.code).currentSong.id })
    }
    const enabled = rooms.updateRoomSettings(created.code, { userId: 'owner' }, { historyAutoplay: true })
    const empty = report(enabled)
    assert.equal(empty.currentSong, null)
    assert.equal(empty.playbackPending, false)
    assert.equal(empty.autoplayPoolCount, 0)
    assert.deepEqual(empty.autoplaySuggestions, [])
    assert.equal(report(enabled).playbackRevision, empty.playbackRevision)
  } finally {
    db.close()
  }
})

test('playback failure API validates reports and returns the persisted next room state', { timeout: 15_000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jukebox-playback-failure-api-'))
  const databasePath = path.join(directory, 'jukebox.sqlite')
  const { db, created, guest, add } = fixture('host_only', databasePath)
  let child
  try {
    const failed = add('unavailable')
    add('next')
    db.close()
    const port = await new Promise((resolve, reject) => {
      const probe = net.createServer()
      probe.once('error', reject)
      probe.listen(0, '127.0.0.1', () => {
        const port = probe.address().port
        probe.close(() => resolve(port))
      })
    })
    const baseUrl = `http://127.0.0.1:${port}`
    child = spawn(process.execPath, ['src/server.js'], {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, PORT: String(port), DATABASE_PATH: databasePath, YOUTUBE_API_KEY: '' },
      stdio: 'ignore',
    })
    let ready = false
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        if ((await fetch(`${baseUrl}/api/health`)).ok) { ready = true; break }
      } catch {
        // Child server is starting.
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    assert.ok(ready, 'test server started')
    const report = (errorCode, hostToken = created.hostToken) => fetch(
      `${baseUrl}/api/rooms/${created.code}/playback/failure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-host-token': hostToken },
        body: JSON.stringify({ songId: failed.currentSong.id, videoId: 'unavailable', errorCode }),
      },
    )
    assert.equal((await report(101, 'wrong-token')).status, 403)
    assert.equal((await report(153)).status, 400)
    const response = await report(101)
    assert.equal(response.status, 200)
    const next = await response.json()
    assert.equal(next.currentSong.videoId, 'next')
    assert.equal((await (await report(150)).json()).currentSong.id, next.currentSong.id)
    const publicRoom = await (await fetch(`${baseUrl}/api/rooms/${created.code}`)).json()
    assert.equal(publicRoom.currentSong.id, next.currentSong.id)
    const history = await (await fetch(`${baseUrl}/api/rooms/${created.code}/history`, {
      headers: { 'x-participant-token': guest.participantToken },
    })).json()
    assert.deepEqual(history.items, [])
  } finally {
    if (db.isOpen) db.close()
    if (child) {
      const stopped = child.exitCode === null ? new Promise((resolve) => child.once('exit', resolve)) : Promise.resolve()
      child.kill('SIGTERM')
      await stopped
    }
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
