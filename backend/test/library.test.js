const test = require('node:test')
const assert = require('node:assert/strict')
const { createDatabase } = require('../src/db')
const { createLibraryService } = require('../src/library')

test('saves one video in multiple user playlists without changing room history', () => {
  const db = createDatabase()
  try {
    db.prepare(`INSERT INTO users (id, discord_id, username, created_at, updated_at, last_login_at)
      VALUES ('user-1', 'discord-1', 'Alice', 1, 1, 1), ('user-2', 'discord-2', 'Bob', 1, 1, 1)`).run()
    db.prepare(`INSERT INTO rooms (id, code, host_token_hash, created_at)
      VALUES ('room-1', 'ABC123', '', 1)`).run()
    db.prepare(`INSERT INTO participants (id, room_id, token_hash, nickname, created_at)
      VALUES ('participant-1', 'room-1', 'token', 'Requester', 1)`).run()
    db.prepare(`INSERT INTO songs
      (id, room_id, video_id, title, artist, duration_seconds, thumbnail_url, added_by, status, position, created_at)
      VALUES ('song-1', 'room-1', 'abcdefghijk', 'Title', 'Artist', 180, 'https://example.com/cover',
        'participant-1', 'played', 0, 1)`).run()

    const library = createLibraryService(db)
    const favorites = library.list('user-1', 'abcdefghijk')[0]
    const custom = library.create('user-1', 'My playlist')
    assert.equal(favorites.kind, 'favorites')
    assert.equal(favorites.containsTrack, false)

    library.addTrack('user-1', favorites.id, 'song-1')
    library.addTrack('user-1', favorites.id, 'song-1')
    library.addTrack('user-1', custom.id, 'song-1')
    const playlists = library.list('user-1', 'abcdefghijk')
    assert.deepEqual(playlists.map(({ trackCount, containsTrack }) => [trackCount, containsTrack]), [[1, true], [1, true]])
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM library_tracks').get().count, 1)
    assert.equal(db.prepare("SELECT status FROM songs WHERE id = 'song-1'").get().status, 'played')
    assert.deepEqual(library.listTracks('user-1', custom.id).map(({ videoId, title }) => ({ videoId, title })), [
      { videoId: 'abcdefghijk', title: 'Title' },
    ])

    assert.throws(() => library.addTrack('user-2', custom.id, 'song-1'), { code: 'PLAYLIST_NOT_FOUND' })
    assert.throws(() => library.removeTrack('user-2', favorites.id, 'abcdefghijk'), { code: 'PLAYLIST_NOT_FOUND' })
    assert.throws(() => library.listTracks('user-2', custom.id), { code: 'PLAYLIST_NOT_FOUND' })
    library.removeTrack('user-1', favorites.id, 'abcdefghijk')
    assert.deepEqual(library.list('user-1', 'abcdefghijk').map(({ trackCount }) => trackCount), [0, 1])
    assert.equal(library.list('user-2', 'abcdefghijk').length, 1)
  } finally {
    db.close()
  }
})
