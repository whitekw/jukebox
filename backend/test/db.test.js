const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { DatabaseSync } = require('node:sqlite')
const { createDatabase } = require('../src/db')

test('migrates the earliest legacy participant to a manager', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jukebox-db-'))
  const databasePath = path.join(directory, 'jukebox.sqlite')
  let db

  try {
    const legacyDb = new DatabaseSync(databasePath)
    legacyDb.exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE rooms (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        host_token_hash TEXT NOT NULL,
        max_songs_per_participant INTEGER NOT NULL DEFAULT 2,
        current_song_id TEXT,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );

      CREATE TABLE participants (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL,
        nickname TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(room_id, token_hash)
      );
    `)
    legacyDb
      .prepare(
        `INSERT INTO rooms (
          id, code, host_token_hash, max_songs_per_participant,
          current_song_id, created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'room-1',
        'ABC234',
        '0'.repeat(64),
        2,
        null,
        Date.now(),
        Date.now() + 60_000,
      )
    legacyDb
      .prepare(
        `INSERT INTO participants (
          id, room_id, token_hash, nickname, created_at
        ) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        'participant-1',
        'room-1',
        '1'.repeat(64),
        'First',
        Date.now(),
      )
    legacyDb.close()

    db = createDatabase(databasePath)
    const columns = db
      .prepare('PRAGMA table_info(rooms)')
      .all()
      .map((column) => column.name)
    const participantColumns = db
      .prepare('PRAGMA table_info(participants)')
      .all()
      .map((column) => column.name)
    const chatMessageColumns = db
      .prepare('PRAGMA table_info(chat_messages)')
      .all()
      .map((column) => column.name)
    const roomFeedColumns = db
      .prepare('PRAGMA table_info(room_feed_entries)')
      .all()
      .map((column) => column.name)
    const migratedRoom = db
      .prepare(
        `SELECT manager_participant_id, host_volume, playback_paused,
                 playback_blocked, playback_mode, playback_position_seconds,
                 playback_anchor_at, playback_pending, playback_revision,
                 empty_since
         FROM rooms WHERE id = ?`,
      )
      .get('room-1')
    const migratedParticipant = db
      .prepare('SELECT is_manager FROM participants WHERE id = ?')
      .get('participant-1')

    assert.ok(columns.includes('manager_participant_id'))
    assert.ok(participantColumns.includes('is_manager'))
    assert.deepEqual(chatMessageColumns, [
      'id',
      'room_id',
      'participant_id',
      'content',
      'created_at',
    ])
    assert.deepEqual(roomFeedColumns, [
      'sequence',
      'id',
      'room_id',
      'entry_type',
      'participant_id',
      'nickname',
      'actor_type',
      'content',
      'event_type',
      'event_data',
      'created_at',
    ])
    assert.ok(columns.includes('host_volume'))
    assert.ok(columns.includes('playback_paused'))
    assert.ok(columns.includes('playback_blocked'))
    assert.ok(columns.includes('playback_mode'))
    assert.ok(columns.includes('playback_position_seconds'))
    assert.ok(columns.includes('playback_anchor_at'))
    assert.ok(columns.includes('playback_pending'))
    assert.ok(columns.includes('empty_since'))
    assert.ok(columns.includes('playback_revision'))
    assert.equal(migratedRoom.manager_participant_id, null)
    assert.equal(migratedRoom.host_volume, 100)
    assert.equal(migratedRoom.playback_paused, 0)
    assert.equal(migratedRoom.playback_blocked, 0)
    assert.equal(migratedRoom.playback_mode, 'host_only')
    assert.equal(migratedRoom.playback_position_seconds, 0)
    assert.equal(migratedRoom.playback_anchor_at, 0)
    assert.equal(migratedRoom.playback_pending, 0)
    assert.equal(migratedRoom.playback_revision, 0)
    assert.equal(migratedRoom.empty_since, null)
    assert.equal(migratedParticipant.is_manager, 1)

    db.prepare('UPDATE participants SET is_manager = 0 WHERE id = ?').run(
      'participant-1',
    )
    db.close()
    db = createDatabase(databasePath)
    assert.equal(
      db
        .prepare('SELECT is_manager FROM participants WHERE id = ?')
        .get('participant-1').is_manager,
      0,
    )
  } finally {
    db?.close()
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('copies legacy chat messages into the unified room feed once', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jukebox-feed-'))
  const databasePath = path.join(directory, 'jukebox.sqlite')
  let db

  try {
    db = createDatabase(databasePath)
    db.prepare(
      `INSERT INTO rooms (
         id, code, host_token_hash, playback_anchor_at,
         created_at, expires_at
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('room-1', 'ABC234', '0'.repeat(64), 1_000, 1_000, 60_000)
    db.prepare(
      `INSERT INTO participants (
         id, room_id, token_hash, nickname, created_at
       ) VALUES (?, ?, ?, ?, ?)`,
    ).run('participant-1', 'room-1', '1'.repeat(64), 'Alice', 1_000)
    db.prepare(
      `INSERT INTO chat_messages (
         id, room_id, participant_id, content, created_at
       ) VALUES (?, ?, ?, ?, ?)`,
    ).run('message-1', 'room-1', 'participant-1', 'legacy', 1_001)
    db.close()

    db = createDatabase(databasePath)
    db.close()
    db = createDatabase(databasePath)
    const entries = db
      .prepare(
        `SELECT id, entry_type, nickname, content
         FROM room_feed_entries WHERE room_id = ?`,
      )
      .all('room-1')
      .map((entry) => ({ ...entry }))

    assert.deepEqual(entries, [
      {
        id: 'message-1',
        entry_type: 'message',
        nickname: 'Alice',
        content: 'legacy',
      },
    ])
  } finally {
    db?.close()
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
