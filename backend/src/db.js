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
      empty_since INTEGER,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS participants (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      nickname TEXT NOT NULL,
      is_manager INTEGER NOT NULL DEFAULT 0 CHECK(is_manager IN (0, 1)),
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

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
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

    CREATE INDEX IF NOT EXISTS rooms_by_expiry ON rooms(expires_at);
    CREATE INDEX IF NOT EXISTS participants_by_room ON participants(room_id);
    CREATE INDEX IF NOT EXISTS songs_by_room_status_position
      ON songs(room_id, status, position);
    CREATE UNIQUE INDEX IF NOT EXISTS active_video_per_room
      ON songs(room_id, video_id)
      WHERE status IN ('queued', 'current');
    CREATE INDEX IF NOT EXISTS chat_messages_by_room_created_at
      ON chat_messages(room_id, created_at);
    CREATE INDEX IF NOT EXISTS room_feed_entries_by_room_sequence
      ON room_feed_entries(room_id, sequence);
  `)

  // 채팅 피드 도입 전에 저장된 메시지를 보존한다. 기존 테이블은 이전
  // 버전으로 롤백할 때를 위해 그대로 두고 이후 쓰기는 통합 피드에만 한다.
  db.exec(`
    INSERT OR IGNORE INTO room_feed_entries (
      id, room_id, entry_type, participant_id, nickname, actor_type,
      content, created_at
    )
    SELECT chat_messages.id, chat_messages.room_id, 'message',
           chat_messages.participant_id, participants.nickname, 'participant',
           chat_messages.content, chat_messages.created_at
    FROM chat_messages
    JOIN participants ON participants.id = chat_messages.participant_id
    ORDER BY chat_messages.created_at ASC, chat_messages.rowid ASC;
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
  if (!roomColumns.has('playback_mode')) {
    db.exec(
      "ALTER TABLE rooms ADD COLUMN playback_mode TEXT NOT NULL DEFAULT 'host_only' CHECK(playback_mode IN ('host_only', 'all_devices'))",
    )
  }
  if (!roomColumns.has('playback_paused')) {
    db.exec(
      'ALTER TABLE rooms ADD COLUMN playback_paused INTEGER NOT NULL DEFAULT 0 CHECK(playback_paused IN (0, 1))',
    )
  }
  if (!roomColumns.has('playback_blocked')) {
    db.exec(
      'ALTER TABLE rooms ADD COLUMN playback_blocked INTEGER NOT NULL DEFAULT 0 CHECK(playback_blocked IN (0, 1))',
    )
  }
  if (!roomColumns.has('playback_position_seconds')) {
    db.exec(
      'ALTER TABLE rooms ADD COLUMN playback_position_seconds REAL NOT NULL DEFAULT 0 CHECK(playback_position_seconds >= 0)',
    )
  }
  if (!roomColumns.has('playback_anchor_at')) {
    db.exec(
      'ALTER TABLE rooms ADD COLUMN playback_anchor_at INTEGER NOT NULL DEFAULT 0',
    )
  }
  if (!roomColumns.has('playback_revision')) {
    db.exec(
      'ALTER TABLE rooms ADD COLUMN playback_revision INTEGER NOT NULL DEFAULT 0',
    )
  }
  if (!roomColumns.has('playback_pending')) {
    db.exec(
      'ALTER TABLE rooms ADD COLUMN playback_pending INTEGER NOT NULL DEFAULT 0 CHECK(playback_pending IN (0, 1))',
    )
  }
  if (!roomColumns.has('empty_since')) {
    db.exec('ALTER TABLE rooms ADD COLUMN empty_since INTEGER')
  }

  const participantColumns = new Set(
    db
      .prepare('PRAGMA table_info(participants)')
      .all()
      .map((column) => column.name),
  )
  const shouldMigrateManagers = !participantColumns.has('is_manager')
  if (shouldMigrateManagers) {
    db.exec(
      'ALTER TABLE participants ADD COLUMN is_manager INTEGER NOT NULL DEFAULT 0 CHECK(is_manager IN (0, 1))',
    )
  }
  db.exec(
    'CREATE INDEX IF NOT EXISTS rooms_by_empty_since ON rooms(empty_since)',
  )

  db.prepare(
    `UPDATE rooms
     SET playback_anchor_at = ?
     WHERE playback_anchor_at = 0 AND current_song_id IS NOT NULL`,
  ).run(Date.now())

  if (shouldMigrateManagers) {
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

      UPDATE participants
      SET is_manager = 1
      WHERE id IN (
        SELECT manager_participant_id
        FROM rooms
        WHERE manager_participant_id IS NOT NULL
      );

      UPDATE participants
      SET is_manager = 1
      WHERE id IN (
        SELECT (
          SELECT candidate.id
          FROM participants AS candidate
          WHERE candidate.room_id = rooms.id
          ORDER BY candidate.created_at ASC, candidate.rowid ASC
          LIMIT 1
        )
        FROM rooms
        WHERE EXISTS (
          SELECT 1 FROM participants WHERE participants.room_id = rooms.id
        )
          AND NOT EXISTS (
            SELECT 1
            FROM participants
            WHERE participants.room_id = rooms.id
              AND participants.is_manager = 1
          )
      );

      UPDATE rooms SET manager_participant_id = NULL;
    `)
  }

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
