const test = require('node:test')
const assert = require('node:assert/strict')
const { createDatabase } = require('../src/db')
const { createAdminService } = require('../src/admin')

function fixture() {
  const db = createDatabase()
  db.prepare(`INSERT INTO users (id, discord_id, username, global_name, created_at, updated_at, last_login_at)
    VALUES ('alice', 'discord-alice', 'alice', 'Alice', 1, 1, 1),
      ('bob', 'discord-bob', 'bob', '', 1, 1, 1), ('empty', 'discord-empty', 'empty', NULL, 1, 1, 1)`).run()
  const insertPlaylist = db.prepare(`INSERT INTO playlists
    (id, owner_user_id, name, kind, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 2)`)
  insertPlaylist.run('custom', 'alice', 'First collection', 'custom', 0)
  insertPlaylist.run('favorites', 'alice', '', 'favorites', 1)
  for (let index = 2; index < 22; index += 1) {
    insertPlaylist.run(`custom-${index}`, 'alice', `Collection ${index}`, 'custom', index)
  }
  insertPlaylist.run('bob-list', 'bob', 'Bob collection', 'custom', 0)
  const insertTrack = db.prepare(`INSERT INTO library_tracks
    (video_id, title, artist, duration_seconds, thumbnail_url, updated_at) VALUES (?, ?, ?, 180, 'https://example.com/cover', 1)`)
  const saveTrack = db.prepare('INSERT INTO playlist_tracks (playlist_id, video_id, added_at) VALUES (?, ?, ?)')
  for (let index = 0; index < 25; index += 1) {
    const id = `video${String(index).padStart(6, '0')}`
    insertTrack.run(id, index === 24 ? 'Needle song' : `Track ${index}`, index === 23 ? 'Unique artist' : 'Artist')
    saveTrack.run('custom', id, 100)
  }
  saveTrack.run('favorites', 'video000024', 200)
  saveTrack.run('bob-list', 'video000024', 300)
  return { db, admin: createAdminService(db) }
}

test('admin playlist reads preserve user order, paginate and never create or update data', () => {
  const { db, admin } = fixture()
  try {
    const changes = db.prepare('SELECT total_changes() AS count').get().count
    db.exec('PRAGMA query_only = ON')
    const first = admin.listUserPlaylists('alice')
    assert.deepEqual({ ...first.user }, { id: 'alice', discordId: 'discord-alice', username: 'alice', displayName: 'Alice' })
    assert.equal(first.total, 22)
    assert.equal(first.pageSize, 20)
    assert.equal(first.items.length, 20)
    assert.deepEqual(first.items.slice(0, 2).map(({ id, trackCount }) => [id, trackCount]), [['custom', 25], ['favorites', 1]])
    assert.deepEqual(admin.listUserPlaylists('alice', 2).items.map(({ id }) => id), ['custom-20', 'custom-21'])
    assert.equal(admin.listUserPlaylists('alice', -1).page, 1)
    assert.equal(admin.listUserPlaylists('bob').user.displayName, 'bob')
    assert.equal(admin.listUserPlaylists('empty').total, 0)
    assert.deepEqual(admin.listUserPlaylistTracks('alice', 'custom-2').items, [])
    assert.equal(admin.listUserPlaylistTracks('alice', 'favorites').items[0].addedAt, 200)
    assert.equal(db.prepare('SELECT total_changes() AS count').get().count, changes)
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM playlists WHERE owner_user_id = 'empty'").get().count, 0)
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM admin_audit_entries').get().count, 0)
  } finally {
    db.close()
  }
})

test('admin playlist tracks search metadata and paginate stable saved order within the selected collection', () => {
  const { db, admin } = fixture()
  try {
    const first = admin.listUserPlaylistTracks('alice', 'custom')
    const second = admin.listUserPlaylistTracks('alice', 'custom', '', 2)
    assert.equal(first.playlist.trackCount, 25)
    assert.equal(first.items.length, 20)
    assert.equal(second.items.length, 5)
    assert.deepEqual([...first.items, ...second.items].map(({ videoId }) => videoId),
      Array.from({ length: 25 }, (_, index) => `video${String(index).padStart(6, '0')}`))
    for (const [query, expected] of [['  Needle  ', 'video000024'], ['Unique artist', 'video000023'], ['video000022', 'video000022']]) {
      const result = admin.listUserPlaylistTracks('alice', 'custom', query)
      assert.equal(result.total, 1)
      assert.equal(result.playlist.trackCount, 25)
      assert.equal(result.items[0].videoId, expected)
      assert.equal(result.items[0].durationSeconds, 180)
    }
    assert.equal(admin.listUserPlaylistTracks('alice', 'favorites', 'Unique artist').total, 0)
    assert.equal(admin.listUserPlaylistTracks('bob', 'bob-list').items[0].addedAt, 300)
  } finally {
    db.close()
  }
})

test('admin playlist lookup requires an existing user and a playlist belonging to that user', () => {
  const { db, admin } = fixture()
  try {
    assert.throws(() => admin.listUserPlaylists('missing'), { status: 404, code: 'USER_NOT_FOUND' })
    assert.throws(() => admin.listUserPlaylistTracks('missing', 'custom'), { status: 404, code: 'USER_NOT_FOUND' })
    assert.throws(() => admin.listUserPlaylistTracks('alice', 'missing'), { status: 404, code: 'PLAYLIST_NOT_FOUND' })
    assert.throws(() => admin.listUserPlaylistTracks('bob', 'custom'), { status: 404, code: 'PLAYLIST_NOT_FOUND' })
  } finally {
    db.close()
  }
})
