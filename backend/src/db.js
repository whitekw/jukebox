const fs = require('node:fs')
const path = require('node:path')
const { DatabaseSync } = require('node:sqlite')

const SCHEMA_VERSION = 9

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
  if (![1, 2, 3, 4, 5, 6, 7, 8, SCHEMA_VERSION].includes(version) && (version !== 0 || hasExistingSchema)) {
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

    CREATE TABLE IF NOT EXISTS extension_grants (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      extension_id TEXT NOT NULL,
      code_challenge TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS extension_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      extension_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL DEFAULT '',
      allow_guests INTEGER NOT NULL DEFAULT 1 CHECK(allow_guests IN (0, 1)),
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
      history_autoplay INTEGER NOT NULL DEFAULT 0 CHECK(history_autoplay IN (0, 1)),
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
      vote_revision INTEGER NOT NULL DEFAULT 0,
      is_autoplay INTEGER NOT NULL DEFAULT 0 CHECK(is_autoplay IN (0, 1)),
      started_at INTEGER,
      started_at_estimated INTEGER NOT NULL DEFAULT 0 CHECK(started_at_estimated IN (0, 1)),
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS song_votes (
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
      requester_participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      voter_participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      vote INTEGER NOT NULL CHECK(vote IN (-1, 1)),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (song_id, voter_participant_id)
    );

    CREATE TABLE IF NOT EXISTS room_autoplay_suggestions (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      video_id TEXT NOT NULL,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      duration_seconds INTEGER NOT NULL,
      thumbnail_url TEXT NOT NULL,
      UNIQUE(room_id, position)
    );

    CREATE TABLE IF NOT EXISTS library_tracks (
      video_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      duration_seconds INTEGER NOT NULL,
      thumbnail_url TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('favorites', 'custom')),
      position INTEGER NOT NULL DEFAULT 0 CHECK(position >= 0),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS playlist_tracks (
      playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
      video_id TEXT NOT NULL REFERENCES library_tracks(video_id),
      added_at INTEGER NOT NULL,
      PRIMARY KEY (playlist_id, video_id)
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
    CREATE INDEX IF NOT EXISTS extension_grants_by_expiry ON extension_grants(expires_at);
    CREATE INDEX IF NOT EXISTS extension_sessions_by_expiry ON extension_sessions(expires_at);
    CREATE INDEX IF NOT EXISTS rooms_by_owner ON rooms(owner_user_id);
    CREATE INDEX IF NOT EXISTS participants_by_room ON participants(room_id);
    CREATE INDEX IF NOT EXISTS participants_by_user ON participants(user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS active_members_by_room
      ON participants(room_id, user_id)
      WHERE user_id IS NOT NULL AND left_at IS NULL;
    CREATE INDEX IF NOT EXISTS songs_by_room_status_position
      ON songs(room_id, status, position);
    CREATE INDEX IF NOT EXISTS song_votes_by_song_vote
      ON song_votes(song_id, vote);
    CREATE INDEX IF NOT EXISTS song_votes_by_room_requester
      ON song_votes(room_id, requester_participant_id, vote);
    CREATE INDEX IF NOT EXISTS room_autoplay_suggestions_by_room_position
      ON room_autoplay_suggestions(room_id, position);
    CREATE UNIQUE INDEX IF NOT EXISTS one_favorites_playlist_per_user
      ON playlists(owner_user_id) WHERE kind = 'favorites';
    CREATE INDEX IF NOT EXISTS playlist_tracks_by_playlist_added
      ON playlist_tracks(playlist_id, added_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS active_video_per_room
      ON songs(room_id, video_id)
      WHERE status IN ('queued', 'current');
    CREATE INDEX IF NOT EXISTS room_feed_entries_by_room_sequence
      ON room_feed_entries(room_id, sequence);
  `)

  const playlistColumns = new Set(db.prepare('PRAGMA table_info(playlists)').all().map(({ name }) => name))
  if (!playlistColumns.has('position')) {
    transaction(db, () => {
      db.exec(`
        ALTER TABLE playlists ADD COLUMN position INTEGER NOT NULL DEFAULT 0 CHECK(position >= 0);
        WITH ordered AS (
          SELECT id, ROW_NUMBER() OVER (
            PARTITION BY owner_user_id
            ORDER BY CASE kind WHEN 'favorites' THEN 0 ELSE 1 END, created_at ASC, rowid ASC
          ) - 1 AS position
          FROM playlists
        )
        UPDATE playlists SET position = (SELECT position FROM ordered WHERE ordered.id = playlists.id);
      `)
    })
  }
  db.exec('CREATE INDEX IF NOT EXISTS playlists_by_owner_position ON playlists(owner_user_id, position)')
  db.exec('DROP INDEX IF EXISTS playlists_by_owner_updated')

  const songColumns = new Set(db.prepare('PRAGMA table_info(songs)').all().map(({ name }) => name))
  if (!songColumns.has('vote_revision')) {
    db.exec('ALTER TABLE songs ADD COLUMN vote_revision INTEGER NOT NULL DEFAULT 0')
  }
  if (!songColumns.has('started_at')) {
    db.exec('ALTER TABLE songs ADD COLUMN started_at INTEGER')
  }
  if (!songColumns.has('started_at_estimated')) {
    db.exec('ALTER TABLE songs ADD COLUMN started_at_estimated INTEGER NOT NULL DEFAULT 0 CHECK(started_at_estimated IN (0, 1))')
  }
  if (!songColumns.has('is_autoplay')) {
    db.exec('ALTER TABLE songs ADD COLUMN is_autoplay INTEGER NOT NULL DEFAULT 0 CHECK(is_autoplay IN (0, 1))')
  }
  if (!songColumns.has('started_at')) {
    db.exec("UPDATE songs SET started_at = created_at, started_at_estimated = 1 WHERE status IN ('current', 'played')")
  }
  db.exec('CREATE INDEX IF NOT EXISTS songs_by_room_started ON songs(room_id, started_at)')

  const roomColumns = new Set(db.prepare('PRAGMA table_info(rooms)').all().map(({ name }) => name))
  if (!roomColumns.has('title')) db.exec("ALTER TABLE rooms ADD COLUMN title TEXT NOT NULL DEFAULT ''")
  if (!roomColumns.has('allow_guests')) {
    db.exec('ALTER TABLE rooms ADD COLUMN allow_guests INTEGER NOT NULL DEFAULT 1 CHECK(allow_guests IN (0, 1))')
  }
  if (!roomColumns.has('history_autoplay')) {
    db.exec('ALTER TABLE rooms ADD COLUMN history_autoplay INTEGER NOT NULL DEFAULT 0 CHECK(history_autoplay IN (0, 1))')
  }
  db.exec("UPDATE rooms SET title = code WHERE title = ''")
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)

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
