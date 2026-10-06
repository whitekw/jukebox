const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { createDatabase } = require('../src/db')
const { createYouTubeSync } = require('../src/youtubeSync')
const { createLibraryService } = require('../src/library')
const scope = 'https://www.googleapis.com/auth/youtube.readonly'
const ids = ['PLownplaylist01', 'PLownplaylist02']
function json(body, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }) }
function fixture(t) {
  const db = createDatabase()
  t.after(() => db.close())
  db.exec("INSERT INTO users (id, discord_id, username, created_at, updated_at, last_login_at) VALUES ('alice', 'discord-alice', 'Alice', 1, 1, 1), ('bob', 'discord-bob', 'Bob', 1, 1, 1)")
  db.exec("INSERT INTO auth_sessions VALUES ('session', 'alice', 'session-hash', 1, 9999999999999)")
  let time = 100000
  const calls = []
  let videos = ['abcdefghijk', 'lmnopqrstuv', 'abcdefghijk', 'unavailable']
  let failItems = false
  let foreign = false
  let block = null
  const fetchImpl = async (raw, init) => {
    const url = new URL(raw); calls.push({ url, init })
    if (url.pathname.endsWith('/token')) return json({ access_token: 'secret-access', refresh_token: 'secret-refresh', expires_in: 3600, scope })
    if (url.pathname.endsWith('/revoke')) return json({})
    if (url.pathname.endsWith('/channels')) return json({ items: [{ id: 'channel-alice', snippet: { title: 'Alice music' } }] })
    if (url.pathname.endsWith('/playlists')) {
      if (url.searchParams.has('id')) return json({ items: url.searchParams.get('id').split(',').map(id => ({ id, snippet: { title: 'Music ' + id, channelId: foreign ? 'channel-other' : 'channel-alice' } })) })
      return json({ items: [{ id: ids[0], snippet: { title: 'Music', thumbnails: {} }, contentDetails: { itemCount: 4 } }], nextPageToken: url.searchParams.has('pageToken') ? undefined : 'page-two' })
    }
    if (url.pathname.endsWith('/playlistItems')) {
      if (block) await block
      if (failItems) return json({ error: 'unavailable' }, 500)
      return json({ items: videos.map(videoId => ({ contentDetails: { videoId } })) })
    }
    if (url.pathname.endsWith('/videos')) return json({ items: url.searchParams.get('id').split(',').filter(id => id !== 'unavailable').map(id => ({ id, snippet: { title: 'Song ' + id, channelTitle: 'Artist', thumbnails: {}, liveBroadcastContent: 'none' }, status: { embeddable: true, privacyStatus: 'public' }, contentDetails: { duration: 'PT3M' } })) })
    throw new Error('Unexpected ' + url)
  }
  const sync = createYouTubeSync(db, { clientId: 'client', clientSecret: 'secret', redirectUri: 'http://localhost/api/account/youtube/callback', encryptionKey: crypto.randomBytes(32).toString('base64'), fetchImpl, now: () => time })
  const connect = async () => { const flow = sync.authorization('alice', 'session-hash'); await sync.complete('alice', 'session-hash', new URL(flow.url).searchParams.get('state'), flow.cookie, 'code') }
  return { db, sync, calls, connect, setVideos: value => { videos = value }, fail: () => { failItems = true }, foreign: () => { foreign = true }, expire: () => { time += 4000000 }, block: value => { block = value } }
}
test('Google linking uses read-only scope, PKCE, bound state and encrypted credentials', async t => {
  const f = fixture(t)
  const flow = f.sync.authorization('alice', 'session-hash'); const url = new URL(flow.url)
  assert.equal(url.searchParams.get('scope'), scope)
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
  for (const args of [['bob', 'session-hash', url.searchParams.get('state')], ['alice', 'other-session', url.searchParams.get('state')], ['alice', 'session-hash', 'bad']]) await assert.rejects(f.sync.complete(...args, flow.cookie, 'code'), { code: 'INVALID_OAUTH_STATE' })
  assert.equal(f.calls.length, 0)
  await f.connect()
  const stored = f.db.prepare('SELECT credentials FROM youtube_connections').get().credentials
  assert.ok(!stored.includes('secret-access') && !stored.includes('secret-refresh'))
  const status = f.sync.status('alice')
  assert.equal(status.connected, true)
  assert.ok(!JSON.stringify(status).includes('secret'))
})
test('lists owned playlists with pagination, imports only selections and updates the same playlist', async t => {
  const f = fixture(t); await f.connect()
  assert.equal((await f.sync.list('alice')).nextPageToken, 'page-two')
  await f.sync.list('alice', 'page-two')
  assert.equal(f.calls.at(-1).url.searchParams.get('pageToken'), 'page-two')
  const first = await f.sync.sync('alice', [ids[0]])
  assert.equal(first.links.length, 1); assert.equal(first.links[0].skippedCount, 2)
  const localId = first.links[0].playlistId
  const library = createLibraryService(f.db)
  assert.deepEqual(library.listTracks('alice', localId).map(v => v.videoId), ['abcdefghijk', 'lmnopqrstuv'])
  f.setVideos(['lmnopqrstuv'])
  const second = await f.sync.sync('alice', [ids[0]])
  assert.equal(second.links[0].playlistId, localId)
  assert.deepEqual(library.listTracks('alice', localId).map(v => v.videoId), ['lmnopqrstuv'])
  assert.equal(f.db.prepare("SELECT COUNT(*) AS count FROM playlists WHERE kind = 'custom'").get().count, 1)
  assert.ok(f.calls.filter(c => c.url.pathname.includes('/youtube/v3/')).every(c => !c.init.method))
})
test('rejects other users playlists and preserves all local data when any remote fetch fails', async t => {
  const f = fixture(t); await f.connect(); await f.sync.sync('alice', [ids[0]])
  const before = f.db.prepare('SELECT * FROM playlist_tracks').all()
  f.foreign(); await assert.rejects(f.sync.sync('alice', [ids[1]]), { code: 'INVALID_YOUTUBE_SELECTION' })
  assert.deepEqual(f.db.prepare('SELECT * FROM playlist_tracks').all(), before)
  const g = fixture(t); await g.connect(); await g.sync.sync('alice', [ids[0]]); const saved = g.db.prepare('SELECT * FROM playlist_tracks').all()
  g.fail(); await assert.rejects(g.sync.sync('alice', ids), { code: 'YOUTUBE_API_ERROR' })
  assert.deepEqual(g.db.prepare('SELECT * FROM playlist_tracks').all(), saved)
  assert.equal(g.sync.status('alice').links.length, 1)
})

test('YouTube order remains intact after unlinking, with newly registered tracks appended', async t => {
  const f = fixture(t); await f.connect()
  f.setVideos(['lmnopqrstuv', 'abcdefghijk'])
  const result = await f.sync.sync('alice', [ids[0]])
  const localId = result.links[0].playlistId
  const library = createLibraryService(f.db)
  const trackIds = () => library.listTracks('alice', localId).map(v => v.videoId)
  assert.deepEqual(trackIds(), ['lmnopqrstuv', 'abcdefghijk'])
  assert.equal(library.list('alice').find(p => p.id === localId).thumbnailUrl, library.listTracks('alice', localId)[0].thumbnailUrl)
  f.sync.unlink('alice', ids[0])
  assert.deepEqual(trackIds(), ['lmnopqrstuv', 'abcdefghijk'])
  library.removeTrack('alice', localId, 'lmnopqrstuv')
  library.addExistingTrack('alice', localId, 'lmnopqrstuv')
  assert.deepEqual(trackIds(), ['abcdefghijk', 'lmnopqrstuv'])
})
test('refreshes tokens and disconnect removes credentials but preserves imported playlists', async t => {
  const f = fixture(t); await f.connect(); await f.sync.sync('alice', [ids[0]])
  f.expire(); await f.sync.list('alice')
  assert.equal(f.calls.filter(c => c.url.pathname.endsWith('/token')).length, 2)
  assert.equal(f.calls.findLast(c => c.url.pathname.endsWith('/token')).init.body.get('grant_type'), 'refresh_token')
  await f.sync.disconnect('alice')
  assert.equal(f.sync.status('alice').connected, false)
  assert.equal(f.sync.status('alice').links.length, 0)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM playlists').get().count, 1)
  await assert.rejects(f.sync.sync('alice', [ids[0]]), { code: 'YOUTUBE_RECONNECT_REQUIRED' })
})
test('a disconnect during import cannot recreate a connection or partial playlist', async t => {
  const f = fixture(t); await f.connect()
  let release
  f.block(new Promise(resolve => { release = resolve }))
  const pending = f.sync.sync('alice', [ids[0]])
  while (!f.calls.some(c => c.url.pathname.endsWith('/playlistItems'))) await new Promise(resolve => setImmediate(resolve))
  await assert.rejects(f.sync.sync('alice', [ids[0]]), { code: 'YOUTUBE_SYNC_BUSY' })
  await f.sync.disconnect('alice'); release()
  await assert.rejects(pending, { code: 'YOUTUBE_RECONNECT_REQUIRED' })
  assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM playlists').get().count, 0)
})

test('expired Google authorization and a revoked website session cannot link the account', async t => {
  const f = fixture(t)
  const expired = f.sync.authorization('alice', 'session-hash')
  f.expire()
  await assert.rejects(f.sync.complete('alice', 'session-hash', new URL(expired.url).searchParams.get('state'), expired.cookie, 'code'), { code: 'INVALID_OAUTH_STATE' })
  assert.equal(f.calls.length, 0)
  const flow = f.sync.authorization('alice', 'session-hash')
  f.db.exec('DELETE FROM auth_sessions')
  await assert.rejects(f.sync.complete('alice', 'session-hash', new URL(flow.url).searchParams.get('state'), flow.cookie, 'code'), { code: 'INVALID_OAUTH_STATE' })
  assert.equal(f.sync.status('alice').connected, false)
})

test('unlinking during an update preserves the local playlist and cannot restore its link', async t => {
  const f = fixture(t); await f.connect()
  const first = await f.sync.sync('alice', [ids[0]])
  const localId = first.links[0].playlistId
  const before = f.db.prepare('SELECT * FROM playlist_tracks').all()
  const itemCalls = f.calls.filter(c => c.url.pathname.endsWith('/playlistItems')).length
  f.setVideos(['lmnopqrstuv'])
  let release
  f.block(new Promise(resolve => { release = resolve }))
  const pending = f.sync.sync('alice', [ids[0]])
  while (f.calls.filter(c => c.url.pathname.endsWith('/playlistItems')).length === itemCalls) await new Promise(resolve => setImmediate(resolve))
  f.sync.unlink('alice', ids[0]); release()
  await assert.rejects(pending, { code: 'YOUTUBE_SYNC_CHANGED' })
  assert.equal(f.sync.status('alice').links.length, 0)
  assert.ok(f.db.prepare('SELECT id FROM playlists WHERE id = ?').get(localId))
  assert.deepEqual(f.db.prepare('SELECT * FROM playlist_tracks').all(), before)
})
