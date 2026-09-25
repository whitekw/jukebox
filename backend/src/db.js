const fs = require('node:fs')
const path = require('node:path')
const { DatabaseSync } = require('node:sqlite')

const SCHEMA_VERSION = 1

function createDatabase(databasePath = ':memory:') {
  if (databasePath !== ':memory:') {
    fs.mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true })
  }

  const db = new DatabaseSync(databasePath)
  db.exec('PRAGMA foreign_keys = ON;')
  if (databasePath !== ':memory:') db.exec('PRAGMA journal_mode = WAL;')

  const version = db.prepare('PRAGMA user_version').get().user_version
  const hasExistingSchema = Boolean(db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' LIMIT 1",
  ).get())
  if (version !== SCHEMA_VERSION && (version !== 0 || hasExistingSchema)) {
    db.close()
    throw new Error('기존 DB 스키마는 지원하지 않습니다. 데이터베이스 파일을 초기화한 뒤 다시 실행해주세요.')
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      discord_id TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL,
      global_name TEXT,
      avatar_hash TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_login_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      host_token_hash TEXT NOT NULL,
      owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      host_volume INTEGER NOT NULL DEFAULT 100 CHECK(host_volume BETWEEN 0 AND 100),
      playback_mode TEXT NOT NULL DEFAULT 'host_only'
        CHECK(playback_mode IN ('host_only', 'all_devices')),
      playback_paused INTEGER NOT NULL DEFAULT 0 CHECK(playback_paused IN (0, 1)),
      playback_blocked INTEGER NOT NULL DEFAULT 0 CHECK(playback_blocked IN (0, 1)),
      playback_position_seconds REAL NOT NULL DEFAULT 0
        CHECK(playback_position_seconds >= 0),
      playback_anchor_at INTEGER NOT NULL DEFAULT 0,
      playback_pending INTEGER NOT NULL DEFAULT 0 CHECK(playback_pending IN (0, 1)),
      playback_revision INTEGER NOT NULL DEFAULT 0,
      current_song_id TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS participants (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      nickname TEXT NOT NULL,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      profile_source TEXT NOT NULL DEFAULT 'custom'
        CHECK(profile_source IN ('account', 'custom')),
      avatar_url TEXT,
      left_at INTEGER,
      offline_since INTEGER,
      is_manager INTEGER NOT NULL DEFAULT 0 CHECK(is_manager IN (0, 1)),
      created_at INTEGER NOT NULL,
      UNIQUE(room_id, token_hash)
    );

    CREATE TABLE IF NOT EXISTS participant_access_tokens (
      participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
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

    CREATE TABLE IF NOT EXISTS room_feed_entries (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      entry_type TEXT NOT NULL CHECK(entry_type IN ('message', 'system')),
      participant_id TEXT REFERENCES participants(id) ON DELETE SET NULL,
      nickname TEXT,
      actor_type TEXT NOT NULL DEFAULT 'participant'
        CHECK(actor_type IN ('participant', 'host', 'system')),
      content TEXT,
      event_type TEXT,
      event_data TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS auth_sessions_by_user ON auth_sessions(user_id);
    CREATE INDEX IF NOT EXISTS auth_sessions_by_expiry ON auth_sessions(expires_at);
    CREATE INDEX IF NOT EXISTS rooms_by_owner ON rooms(owner_user_id);
    CREATE INDEX IF NOT EXISTS participants_by_room ON participants(room_id);
    CREATE INDEX IF NOT EXISTS participants_by_user ON participants(user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS active_members_by_room
      ON participants(room_id, user_id)
      WHERE user_id IS NOT NULL AND left_at IS NULL;
    CREATE INDEX IF NOT EXISTS songs_by_room_status_position
      ON songs(room_id, status, position);
    CREATE UNIQUE INDEX IF NOT EXISTS active_video_per_room
      ON songs(room_id, video_id)
      WHERE status IN ('queued', 'current');
    CREATE INDEX IF NOT EXISTS room_feed_entries_by_room_sequence
      ON room_feed_entries(room_id, sequence);
    PRAGMA user_version = 1;
  `)

  db.exec("UPDATE rooms SET host_token_hash = '' WHERE playback_mode = 'all_devices' AND host_token_hash <> ''")
  db.exec('UPDATE participants SET is_manager = 0 WHERE user_id IS NULL AND is_manager = 1')

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
