const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { DatabaseSync } = require('node:sqlite')
const { createDatabase } = require('../src/db')
const { createAdminService } = require('../src/admin')
const { createRoomService } = require('../src/rooms')
const { hashToken } = require('../src/auth')

const adminDiscordId = '123456789012345678'
const memberDiscordId = '234567890123456789'

function availablePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const port = probe.address().port
      probe.close(() => resolve(port))
    })
  })
}

async function waitForServer(baseUrl) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(`${baseUrl}/api/health`)).ok) return
    } catch {
      // Child server is starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error('Test server did not start')
}

test('admin queries expose operational summaries and enforce the Discord allowlist', () => {
  const db = createDatabase()
  try {
    db.prepare(`INSERT INTO users (id, discord_id, username, created_at, updated_at, last_login_at)
      VALUES ('admin', ?, 'operator', 1, 1, 1), ('member', ?, 'member', 1, 1, 1)`)
      .run(adminDiscordId, memberDiscordId)
    const rooms = createRoomService(db)
    const created = rooms.createRoom({ ownerUserId: 'member', nickname: 'Member', participantUserId: 'member' })
    rooms.addSong(created.code, created.participantToken, {
      videoId: 'aaaaaaaaaaa', title: 'Playing', artist: 'Artist',
      durationSeconds: 180, thumbnailUrl: 'https://example.com/image.jpg',
    }, 'member')
    const service = createAdminService(db, {
      discordIds: ` ${adminDiscordId} `,
      onlineCount: (code) => Number(code === created.code),
    })
    const operator = { id: 'admin', discordId: adminDiscordId }
    assert.equal(service.requireAdmin(operator), operator)
    assert.throws(() => service.requireAdmin(null), { code: 'AUTH_REQUIRED' })
    assert.throws(() => service.requireAdmin({ id: 'member', discordId: memberDiscordId }),
      { code: 'ADMIN_FORBIDDEN' })
    assert.throws(() => createAdminService(db).requireAdmin(operator),
      { code: 'ADMIN_FORBIDDEN' })
    assert.deepEqual(service.listOverview().totals, {
      users: 2, rooms: 1, activeRooms: 1, onlineParticipants: 1,
      queuedSongs: 0, playsToday: 1, totalPlays: 1,
    })
    assert.equal(service.listOverview().daily.length, 14)
    assert.equal(service.listRooms(created.code.toLowerCase()).items[0].code, created.code)
    assert.equal(service.listUsers('member').items[0].discordId, memberDiscordId)
    assert.equal(service.getRoom(created.code).songs[0].title, 'Playing')
    assert.throws(() => service.getRoom('UNKNOWN'), { code: 'ROOM_NOT_FOUND' })
  } finally {
    db.close()
  }
})

test('admin daily activity follows local midnight across a daylight-saving change', () => {
  const db = createDatabase()
  try {
    db.prepare(`INSERT INTO users (id, discord_id, username, created_at, updated_at, last_login_at)
      VALUES ('admin', ?, 'operator', 1, 1, 1)`).run(adminDiscordId)
    let clock = Date.UTC(2026, 2, 8, 4, 30) // March 7, 23:30 in New York.
    const rooms = createRoomService(db, { now: () => clock })
    const first = rooms.createRoom({ ownerUserId: 'admin', nickname: 'Operator', participantUserId: 'admin' })
    rooms.addSong(first.code, first.participantToken, {
      videoId: 'ccccccccccc', title: 'First', artist: 'Artist',
      durationSeconds: 180, thumbnailUrl: 'https://example.com/image.jpg',
    }, 'admin')
    clock = Date.UTC(2026, 2, 8, 5, 30) // March 8, 00:30 in New York.
    const second = rooms.createRoom({ ownerUserId: 'admin', nickname: 'Operator', participantUserId: 'admin' })
    rooms.addSong(second.code, second.participantToken, {
      videoId: 'ddddddddddd', title: 'Second', artist: 'Artist',
      durationSeconds: 180, thumbnailUrl: 'https://example.com/image.jpg',
    }, 'admin')
    const service = createAdminService(db, { now: () => Date.UTC(2026, 2, 9, 12) })
    const dayStarts = Array.from({ length: 15 }, (_, index) =>
      Date.UTC(2026, 1, 24 + index, index >= 13 ? 4 : 5))
    const daily = service.listOverview(dayStarts.join(',')).daily
    assert.deepEqual(daily.slice(11, 13).map(({ plays, rooms: roomCount }) => [plays, roomCount]),
      [[1, 1], [1, 1]])
    assert.equal(dayStarts[13] - dayStarts[12], 23 * 60 * 60 * 1000)
    assert.throws(() => service.listOverview('1,2'), { code: 'INVALID_DAY_RANGE' })
  } finally {
    db.close()
  }
})

test('admin API gates data and changes, records pauses and revokes sessions', { timeout: 10_000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jukebox-admin-'))
  const databasePath = path.join(directory, 'jukebox.sqlite')
  const db = createDatabase(databasePath)
  const adminToken = crypto.randomBytes(32).toString('base64url')
  const memberToken = crypto.randomBytes(32).toString('base64url')
  let child
  try {
    db.prepare(`INSERT INTO users (id, discord_id, username, created_at, updated_at, last_login_at)
      VALUES ('admin', ?, 'operator', 1, 1, 1), ('member', ?, 'member', 1, 1, 1)`)
      .run(adminDiscordId, memberDiscordId)
    const insertSession = db.prepare(`INSERT INTO auth_sessions
      (id, user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)`)
    insertSession.run(crypto.randomUUID(), 'admin', hashToken(adminToken), Date.now(), Date.now() + 60_000)
    insertSession.run(crypto.randomUUID(), 'member', hashToken(memberToken), Date.now(), Date.now() + 60_000)
    const rooms = createRoomService(db)
    const room = rooms.createRoom({ ownerUserId: 'member', nickname: 'Member', participantUserId: 'member' })
    rooms.addSong(room.code, room.participantToken, {
      videoId: 'bbbbbbbbbbb', title: 'Now playing', artist: 'Artist',
      durationSeconds: 180, thumbnailUrl: 'https://example.com/image.jpg',
    }, 'member')
    db.close()

    const port = await availablePort()
    const baseUrl = `http://127.0.0.1:${port}`
    child = spawn(process.execPath, ['src/server.js'], {
      cwd: path.resolve(__dirname, '..'),
      env: {
        ...process.env, PORT: String(port), DATABASE_PATH: databasePath,
        ADMIN_DISCORD_IDS: adminDiscordId, YOUTUBE_API_KEY: '',
      },
      stdio: 'ignore',
    })
    await waitForServer(baseUrl)
    const adminHeaders = { Cookie: `jukebox_session=${adminToken}` }
    const memberHeaders = { Cookie: `jukebox_session=${memberToken}` }
    assert.equal((await fetch(`${baseUrl}/api/admin/overview`)).status, 401)
    const forbiddenResponse = await fetch(`${baseUrl}/api/admin/overview`, { headers: memberHeaders })
    assert.equal(forbiddenResponse.status, 403)
    assert.deepEqual((await forbiddenResponse.json()).error.details.user, {
      discordId: memberDiscordId, displayName: 'member',
    })
    const today = new Date()
    const dayStarts = Array.from({ length: 15 }, (_, index) =>
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 13 + index))
    const overviewResponse = await fetch(
      `${baseUrl}/api/admin/overview?dayStarts=${dayStarts.join(',')}`,
      { headers: adminHeaders },
    )
    assert.equal(overviewResponse.status, 200)
    const overview = await overviewResponse.json()
    assert.equal(overview.totals.rooms, 1)
    assert.equal(overview.daily[0].startAt, dayStarts[0])
    assert.equal((await fetch(`${baseUrl}/api/admin/rooms/${room.code}`, { headers: adminHeaders })).status, 200)
    const actionUrl = `${baseUrl}/api/admin/rooms/${room.code}/playback`
    const patch = (headers) => fetch(actionUrl, {
      method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ paused: true }),
    })
    assert.equal((await patch(adminHeaders)).status, 403)
    assert.equal((await patch({ ...adminHeaders, 'X-Bside-Admin-Action': '1', Origin: 'https://evil.example' })).status, 403)
    const actionHeaders = { ...adminHeaders, 'X-Bside-Admin-Action': '1', Origin: baseUrl }
    const faultDb = new DatabaseSync(databasePath)
    try {
      faultDb.exec(`CREATE TRIGGER reject_admin_audit BEFORE INSERT ON admin_audit_entries
        BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END`)
      assert.equal((await patch(actionHeaders)).status, 500)
      const unchanged = await fetch(`${baseUrl}/api/admin/rooms/${room.code}`, { headers: adminHeaders })
      assert.equal((await unchanged.json()).playbackPaused, false)
    } finally {
      faultDb.exec('DROP TRIGGER IF EXISTS reject_admin_audit')
      faultDb.close()
    }
    assert.equal((await patch(actionHeaders)).status, 200)
    const stateDb = new DatabaseSync(databasePath)
    try {
      const revision = stateDb.prepare('SELECT playback_revision FROM rooms WHERE code = ?')
        .get(room.code).playback_revision
      assert.equal((await patch(actionHeaders)).status, 200)
      assert.equal(stateDb.prepare('SELECT playback_revision FROM rooms WHERE code = ?')
        .get(room.code).playback_revision, revision)
      assert.equal(stateDb.prepare("SELECT COUNT(*) AS count FROM admin_audit_entries WHERE action = 'room_paused'")
        .get().count, 1)
    } finally {
      stateDb.close()
    }
    const revoke = await fetch(`${baseUrl}/api/admin/users/member/revoke-sessions`, {
      method: 'POST', headers: actionHeaders,
    })
    assert.equal(revoke.status, 200)
    assert.equal((await revoke.json()).revoked, 1)
    assert.equal((await fetch(`${baseUrl}/api/auth/session`, { headers: memberHeaders }).then((response) => response.json())).user, null)
    assert.equal((await fetch(`${baseUrl}/api/admin/users/admin/revoke-sessions`, {
      method: 'POST', headers: actionHeaders,
    })).status, 400)
    const audit = await fetch(`${baseUrl}/api/admin/audit`, { headers: adminHeaders }).then((response) => response.json())
    assert.deepEqual(audit.items.map((entry) => entry.action), ['sessions_revoked', 'room_paused'])
  } finally {
    if (db.isOpen) db.close()
    if (child) {
      const stopped = child.exitCode === null
        ? new Promise((resolve) => child.once('exit', resolve))
        : Promise.resolve()
      child.kill('SIGTERM')
      await stopped
    }
    if (path.resolve(directory).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`)) {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  }
})
