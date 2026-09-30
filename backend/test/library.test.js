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
    assert.deepEqual(library.listSavedVideoIds('user-1'), ['abcdefghijk'])
    assert.deepEqual(library.listSavedVideoIds('user-2'), [])
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

test('renames and deletes only owned custom playlists while preserving other collections', () => {
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
    const favorites = library.list('user-1')[0]
    const custom = library.create('user-1', 'Old name')
    library.addTrack('user-1', favorites.id, 'song-1')
    library.addTrack('user-1', custom.id, 'song-1')

    assert.throws(() => library.rename('user-2', custom.id, 'Other'), { code: 'PLAYLIST_NOT_FOUND' })
    assert.throws(() => library.remove('user-2', custom.id), { code: 'PLAYLIST_NOT_FOUND' })
    assert.throws(() => library.rename('user-1', favorites.id, 'Other'), { code: 'PLAYLIST_IMMUTABLE' })
    assert.throws(() => library.remove('user-1', favorites.id), { code: 'PLAYLIST_IMMUTABLE' })
    assert.throws(() => library.rename('user-1', custom.id, '  '), { code: 'INVALID_PLAYLIST_NAME' })
    assert.equal(library.rename('user-1', custom.id, '  New name  ').name, 'New name')
    assert.equal(library.list('user-1').find(({ id }) => id === custom.id).name, 'New name')

    assert.deepEqual(library.remove('user-1', custom.id), { deleted: true })
    assert.throws(() => library.listTracks('user-1', custom.id), { code: 'PLAYLIST_NOT_FOUND' })
    assert.equal(library.list('user-1')[0].trackCount, 1)
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM library_tracks').get().count, 1)
  } finally {
    db.close()
  }
})

test('copies a stored video between playlists and can remove it from every playlist', () => {
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
    const favorites = library.list('user-1')[0]
    const custom = library.create('user-1', 'Other playlist')
    assert.throws(() => library.addExistingTrack('user-1', custom.id, 'not-stored'), { code: 'SONG_NOT_FOUND' })
    library.addTrack('user-1', favorites.id, 'song-1')
    library.addExistingTrack('user-1', custom.id, 'abcdefghijk')
    library.addExistingTrack('user-1', custom.id, 'abcdefghijk')
    assert.throws(() => library.addExistingTrack('user-2', custom.id, 'abcdefghijk'), { code: 'PLAYLIST_NOT_FOUND' })
    assert.deepEqual(library.list('user-1', 'abcdefghijk').map(({ trackCount }) => trackCount), [1, 1])

    library.removeTrack('user-1', favorites.id, 'abcdefghijk')
    library.removeTrack('user-1', custom.id, 'abcdefghijk')
    assert.deepEqual(library.listSavedVideoIds('user-1'), [])
    assert.equal(library.list('user-1', 'abcdefghijk').some(({ containsTrack }) => containsTrack), false)
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM library_tracks').get().count, 1)
    library.addExistingTrack('user-1', custom.id, 'abcdefghijk')
    assert.equal(library.listTracks('user-1', custom.id)[0].videoId, 'abcdefghijk')
  } finally {
    db.close()
  }
})

test('keeps creation order after metadata changes and persists a reordered playlist per account', () => {
  const db = createDatabase()
  try {
    db.prepare(`INSERT INTO users (id, discord_id, username, created_at, updated_at, last_login_at)
      VALUES ('user-1', 'discord-1', 'Alice', 1, 1, 1), ('user-2', 'discord-2', 'Bob', 1, 1, 1)`).run()
    const library = createLibraryService(db)
    const favorites = library.list('user-1')[0]
    const oldest = library.create('user-1', 'Oldest')
    const newest = library.create('user-1', 'Newest')
    const other = library.list('user-2')[0]
    const ids = () => library.list('user-1').map(({ id }) => id)

    assert.deepEqual(ids(), [favorites.id, oldest.id, newest.id])
    library.rename('user-1', oldest.id, 'Renamed')
    db.prepare(`INSERT INTO library_tracks (video_id, title, artist, duration_seconds, thumbnail_url, updated_at)
      VALUES ('video-1', 'Song', 'Artist', 90, 'https://example.com/image', 1)`).run()
    library.addExistingTrack('user-1', newest.id, 'video-1')
    db.prepare('UPDATE playlists SET updated_at = updated_at + 100000 WHERE id = ?').run(newest.id)
    assert.deepEqual(ids(), [favorites.id, oldest.id, newest.id])

    assert.deepEqual(library.reorder('user-1', newest.id, 0).map(({ id }) => id), [newest.id, favorites.id, oldest.id])
    assert.deepEqual(ids(), [newest.id, favorites.id, oldest.id])
    assert.deepEqual(library.reorder('user-1', newest.id, 0).map(({ id }) => id), ids())
    assert.deepEqual(library.list('user-2').map(({ id }) => id), [other.id])
    assert.throws(() => library.reorder('user-2', newest.id, 0), { code: 'PLAYLIST_NOT_FOUND' })
    assert.throws(() => library.reorder('user-1', other.id, 0), { code: 'PLAYLIST_NOT_FOUND' })
    assert.throws(() => library.reorder('user-1', oldest.id, -1), { code: 'INVALID_PLAYLIST_POSITION' })
    assert.throws(() => library.reorder('user-1', oldest.id, 3), { code: 'INVALID_PLAYLIST_POSITION' })
    assert.throws(() => library.reorder('user-1', oldest.id, 1.5), { code: 'INVALID_PLAYLIST_POSITION' })
    assert.deepEqual(ids(), [newest.id, favorites.id, oldest.id])

    const appended = library.create('user-1', 'Appended')
    assert.deepEqual(ids(), [newest.id, favorites.id, oldest.id, appended.id])
  } finally {
    db.close()
  }
})
