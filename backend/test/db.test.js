const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { DatabaseSync } = require('node:sqlite')
const { createDatabase } = require('../src/db')
const { createLibraryService } = require('../src/library')

test('creates the current schema and reopens it without data loss', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jukebox-db-'))
  const databasePath = path.join(directory, 'jukebox.sqlite')
  try {
    let db = createDatabase(databasePath)
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 8)
    const roomColumns = db.prepare('PRAGMA table_info(rooms)').all().map(({ name }) => name)
    assert.ok(roomColumns.includes('owner_user_id'))
    assert.ok(roomColumns.includes('title'))
    assert.ok(roomColumns.includes('allow_guests'))
    assert.ok(roomColumns.includes('history_autoplay'))
    assert.ok(db.prepare('PRAGMA table_info(playlists)').all().some(({ name }) => name === 'position'))
    assert.ok(db.prepare('PRAGMA table_info(songs)').all().some(({ name }) => name === 'vote_revision'))
    assert.ok(db.prepare('PRAGMA table_info(songs)').all().some(({ name }) => name === 'started_at'))
    assert.ok(db.prepare('PRAGMA table_info(songs)').all().some(({ name }) => name === 'is_autoplay'))
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'song_votes'").get())
    assert.ok(!roomColumns.includes('retention_mode'))
    assert.ok(!roomColumns.includes('manager_participant_id'))
    assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'chat_messages'").get(), undefined)
    db.prepare(
      `INSERT INTO rooms (id, code, host_token_hash, playback_mode, created_at)
       VALUES ('room-1', 'ABC234', 'old-host-hash', 'all_devices', 1)`,
    ).run()
    db.prepare(
      `INSERT INTO participants (id, room_id, token_hash, nickname, is_manager, created_at)
       VALUES ('guest-1', 'room-1', 'guest-token', 'Guest', 1, 1)`,
    ).run()
    db.close()
    db = createDatabase(databasePath)
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 8)
    assert.equal(
      db.prepare("SELECT host_token_hash FROM rooms WHERE code = 'ABC234'").get().host_token_hash,
      '',
    )
    assert.equal(db.prepare("SELECT is_manager FROM participants WHERE id = 'guest-1'").get().is_manager, 0)
    db.close()
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('upgrades version 1 databases without deleting rooms', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jukebox-upgrade-'))
  const databasePath = path.join(directory, 'jukebox.sqlite')
  try {
    let db = createDatabase(databasePath)
    db.prepare(
      `INSERT INTO rooms (id, code, host_token_hash, created_at)
       VALUES ('room-1', 'ABC234', 'host-hash', 1)`,
    ).run()
    db.exec('DROP TABLE extension_grants; DROP TABLE extension_sessions; PRAGMA user_version = 1;')
    db.close()

    db = createDatabase(databasePath)
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 8)
    assert.equal(db.prepare("SELECT code FROM rooms WHERE id = 'room-1'").get().code, 'ABC234')
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'extension_sessions'").get())
    db.close()
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('upgrades existing rooms with a code title and guest access enabled', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jukebox-room-settings-'))
  const databasePath = path.join(directory, 'jukebox.sqlite')
  try {
    let db = createDatabase(databasePath)
    db.prepare(
      `INSERT INTO rooms (id, code, host_token_hash, created_at)
       VALUES ('room-1', 'ABC234', '', 1)`,
    ).run()
    db.exec('ALTER TABLE rooms DROP COLUMN title; ALTER TABLE rooms DROP COLUMN allow_guests; PRAGMA user_version = 2;')
    db.close()

    db = createDatabase(databasePath)
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 8)
    const room = db.prepare("SELECT title, allow_guests FROM rooms WHERE code = 'ABC234'").get()
    db.close()
    assert.equal(room.title, 'ABC234')
    assert.equal(room.allow_guests, 1)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('upgrades version 3 databases with personal playlists and keeps songs', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jukebox-playlist-upgrade-'))
  const databasePath = path.join(directory, 'jukebox.sqlite')
  try {
    let db = createDatabase(databasePath)
    db.prepare(`INSERT INTO rooms (id, code, host_token_hash, created_at)
      VALUES ('room-1', 'ABC234', '', 1)`).run()
    db.exec('DROP TABLE playlist_tracks; DROP TABLE playlists; DROP TABLE library_tracks; PRAGMA user_version = 3;')
    db.close()
    db = createDatabase(databasePath)
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 8)
    assert.equal(db.prepare("SELECT code FROM rooms WHERE id = 'room-1'").get().code, 'ABC234')
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'playlist_tracks'").get())
    db.close()
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('upgrades version 4 playlists to creation order without losing tracks', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jukebox-playlist-order-'))
  const databasePath = path.join(directory, 'jukebox.sqlite')
  let db
  try {
    db = createDatabase(databasePath)
    db.prepare(`INSERT INTO users (id, discord_id, username, created_at, updated_at, last_login_at)
      VALUES ('user-1', 'discord-1', 'Alice', 1, 1, 1)`).run()
    db.prepare(`INSERT INTO playlists (id, owner_user_id, name, kind, created_at, updated_at)
      VALUES ('favorite', 'user-1', '', 'favorites', 10, 10),
             ('older', 'user-1', 'Older', 'custom', 20, 500),
             ('newer', 'user-1', 'Newer', 'custom', 30, 1000)`).run()
    db.prepare(`INSERT INTO library_tracks (video_id, title, artist, duration_seconds, thumbnail_url, updated_at)
      VALUES ('video-1', 'Song', 'Artist', 90, 'https://example.com/image', 40)`).run()
    db.prepare(`INSERT INTO playlist_tracks (playlist_id, video_id, added_at)
      VALUES ('older', 'video-1', 40)`).run()
    db.exec('DROP INDEX playlists_by_owner_position; ALTER TABLE playlists DROP COLUMN position; PRAGMA user_version = 4;')
    db.close()
    db = createDatabase(databasePath)
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 8)
    assert.deepEqual(db.prepare('SELECT id, position FROM playlists ORDER BY position').all().map(({ id, position }) => ({ id, position })), [
      { id: 'favorite', position: 0 },
      { id: 'older', position: 1 },
      { id: 'newer', position: 2 },
    ])
    assert.equal(db.prepare('SELECT video_id FROM playlist_tracks WHERE playlist_id = ?').get('older').video_id, 'video-1')
    db.close()
    db = createDatabase(databasePath)
    assert.deepEqual(db.prepare('SELECT id FROM playlists ORDER BY position').all().map(({ id }) => id), ['favorite', 'older', 'newer'])
    assert.deepEqual(createLibraryService(db).reorder('user-1', 'newer', 0).map(({ id }) => id), ['newer', 'favorite', 'older'])
    db.close()
    db = createDatabase(databasePath)
    assert.deepEqual(createLibraryService(db).list('user-1').map(({ id }) => id), ['newer', 'favorite', 'older'])
  } finally {
    db?.close()
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('upgrades version 5 rooms for song votes without losing songs', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jukebox-song-votes-'))
  const databasePath = path.join(directory, 'jukebox.sqlite')
  let db
  try {
    db = createDatabase(databasePath)
    db.prepare(`INSERT INTO rooms (id, code, host_token_hash, created_at)
      VALUES ('room-1', 'ABC234', '', 1)`).run()
    db.prepare(`INSERT INTO participants (id, room_id, token_hash, nickname, created_at)
      VALUES ('person-1', 'room-1', 'token', 'Listener', 1)`).run()
    db.prepare(`INSERT INTO songs (id, room_id, video_id, title, artist, duration_seconds,
      thumbnail_url, added_by, status, position, created_at)
      VALUES ('song-1', 'room-1', 'video-1', 'Song', 'Artist', 90,
        'https://example.com/image', 'person-1', 'played', 0, 1)`).run()
    db.exec('DROP TABLE song_votes; ALTER TABLE songs DROP COLUMN vote_revision; PRAGMA user_version = 5;')
    db.close()
    db = createDatabase(databasePath)
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 8)
    assert.equal(db.prepare('SELECT title, vote_revision FROM songs WHERE id = ?').get('song-1').title, 'Song')
    assert.equal(db.prepare('SELECT vote_revision FROM songs WHERE id = ?').get('song-1').vote_revision, 0)
    assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'song_votes'").get())
  } finally {
    db?.close()
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('upgrades version 6 playback history with estimated dates for existing plays', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jukebox-playback-stats-'))
  const databasePath = path.join(directory, 'jukebox.sqlite')
  let db
  try {
    db = createDatabase(databasePath)
    db.prepare(`INSERT INTO rooms (id, code, host_token_hash, created_at)
      VALUES ('room-1', 'ABC234', '', 1)`).run()
    db.prepare(`INSERT INTO participants (id, room_id, token_hash, nickname, created_at)
      VALUES ('person-1', 'room-1', 'token', 'Listener', 1)`).run()
    db.prepare(`INSERT INTO songs (id, room_id, video_id, title, artist, duration_seconds,
      thumbnail_url, added_by, status, position, created_at)
      VALUES ('played', 'room-1', 'video-1', 'Played', 'Artist', 90,
        'image', 'person-1', 'played', 0, 100),
        ('queued', 'room-1', 'video-2', 'Queued', 'Artist', 90,
        'image', 'person-1', 'queued', 1, 200)`).run()
    db.exec(`DROP INDEX songs_by_room_started;
      ALTER TABLE songs DROP COLUMN started_at;
      ALTER TABLE songs DROP COLUMN started_at_estimated;
      PRAGMA user_version = 6;`)
    db.close()

    db = createDatabase(databasePath)
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 8)
    assert.deepEqual(db.prepare('SELECT id, started_at, started_at_estimated FROM songs ORDER BY created_at').all()
      .map(({ id, started_at, started_at_estimated }) => ({ id, started_at, started_at_estimated })), [
      { id: 'played', started_at: 100, started_at_estimated: 1 },
      { id: 'queued', started_at: null, started_at_estimated: 0 },
    ])
  } finally {
    db?.close()
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('adds history autoplay fields to version 7 rooms without changing saved plays', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jukebox-history-autoplay-'))
  const databasePath = path.join(directory, 'jukebox.sqlite')
  let db
  try {
    db = createDatabase(databasePath)
    db.prepare(`INSERT INTO rooms (id, code, host_token_hash, created_at)
      VALUES ('room-1', 'ABC234', '', 1)`).run()
    db.prepare(`INSERT INTO participants (id, room_id, token_hash, nickname, created_at)
      VALUES ('person-1', 'room-1', 'token', 'Listener', 1)`).run()
    db.prepare(`INSERT INTO songs (id, room_id, video_id, title, artist, duration_seconds,
      thumbnail_url, added_by, status, position, started_at, created_at)
      VALUES ('played', 'room-1', 'video-1', 'Played', 'Artist', 90,
        'image', 'person-1', 'played', 0, 1, 1)`).run()
    db.exec(`ALTER TABLE songs DROP COLUMN is_autoplay;
      ALTER TABLE rooms DROP COLUMN history_autoplay;
      PRAGMA user_version = 7;`)
    db.close()
    db = createDatabase(databasePath)
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 8)
    const savedSong = db.prepare('SELECT title, is_autoplay FROM songs WHERE id = ?').get('played')
    assert.equal(savedSong.title, 'Played')
    assert.equal(savedSong.is_autoplay, 0)
    assert.equal(db.prepare('SELECT history_autoplay FROM rooms WHERE id = ?').get('room-1').history_autoplay, 0)
  } finally {
    db?.close()
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('rejects an old database with a clear reset message', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jukebox-old-db-'))
  const databasePath = path.join(directory, 'jukebox.sqlite')
  try {
    const oldDb = new DatabaseSync(databasePath)
    oldDb.exec('CREATE TABLE rooms (id TEXT PRIMARY KEY)')
    oldDb.close()
    assert.throws(() => createDatabase(databasePath), /데이터베이스 파일을 초기화/)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
