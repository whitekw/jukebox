const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { DatabaseSync } = require('node:sqlite')
const { createDatabase } = require('../src/db')

test('creates the current schema and reopens it without migration', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jukebox-db-'))
  const databasePath = path.join(directory, 'jukebox.sqlite')
  try {
    let db = createDatabase(databasePath)
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 1)
    const roomColumns = db.prepare('PRAGMA table_info(rooms)').all().map(({ name }) => name)
    assert.ok(roomColumns.includes('owner_user_id'))
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
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 1)
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
