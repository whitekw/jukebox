const fs = require('node:fs')
const path = require('node:path')
const { DatabaseSync } = require('node:sqlite')

function createDatabase(databasePath = ':memory:') {
  if (databasePath !== ':memory:') {
    fs.mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true })
  }

  const db = new DatabaseSync(databasePath)
  db.exec('PRAGMA foreign_keys = ON;')
  if (databasePath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;')
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      host_token_hash TEXT NOT NULL,
      max_songs_per_participant INTEGER NOT NULL DEFAULT 2,
      manager_participant_id TEXT,
      host_volume INTEGER NOT NULL DEFAULT 100 CHECK(host_volume BETWEEN 0 AND 100),
      current_song_id TEXT,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS participants (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      nickname TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(room_id, token_hash)
    );

    CREATE TABLE IF NOT EXISTS songs (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      video_id TEXT NOT NULL,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      duration_seconds INTEGER NOT NULL,
      thumbnail_url TEXT NOT NULL,
      added_by TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK(status IN ('queued', 'current', 'played', 'removed')),
      position INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS rooms_by_expiry ON rooms(expires_at);
    CREATE INDEX IF NOT EXISTS participants_by_room ON participants(room_id);
    CREATE INDEX IF NOT EXISTS songs_by_room_status_position
      ON songs(room_id, status, position);
    CREATE UNIQUE INDEX IF NOT EXISTS active_video_per_room
      ON songs(room_id, video_id)
      WHERE status IN ('queued', 'current');
  `)

  const roomColumns = new Set(
    db.prepare('PRAGMA table_info(rooms)').all().map((column) => column.name),
  )
  if (!roomColumns.has('manager_participant_id')) {
    db.exec('ALTER TABLE rooms ADD COLUMN manager_participant_id TEXT')
  }
  if (!roomColumns.has('host_volume')) {
    db.exec(
      'ALTER TABLE rooms ADD COLUMN host_volume INTEGER NOT NULL DEFAULT 100 CHECK(host_volume BETWEEN 0 AND 100)',
    )
  }

  db.exec(`
    UPDATE rooms
    SET manager_participant_id = (
      SELECT participants.id
      FROM participants
      WHERE participants.room_id = rooms.id
      ORDER BY participants.created_at ASC, participants.rowid ASC
      LIMIT 1
    )
    WHERE manager_participant_id IS NULL
      AND EXISTS (
        SELECT 1 FROM participants WHERE participants.room_id = rooms.id
      );
  `)

  return db
}

function transaction(db, operation) {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = operation()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

module.exports = { createDatabase, transaction }
