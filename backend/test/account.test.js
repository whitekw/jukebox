const test = require('node:test')
const assert = require('node:assert/strict')
const { createDatabase } = require('../src/db')
const { createAccountService } = require('../src/account')
const { createDiscordAuth, publicUser } = require('../src/auth')

function seed(t) {
  const db = createDatabase(); t.after(() => db.close())
  db.exec(`INSERT INTO users (id, discord_id, username, global_name, avatar_hash, created_at, updated_at, last_login_at)
    VALUES ('u1', 'd1', 'first', 'Alice', 'old-avatar', 1, 1, 1), ('u2', 'd2', 'second', 'Bob', NULL, 1, 1, 1);
    INSERT INTO rooms (id, code, host_token_hash, owner_user_id, created_at) VALUES ('r1', 'ROOM01', 'host1', 'u1', 1), ('r2', 'ROOM02', 'host2', 'u2', 1);
    INSERT INTO participants (id, room_id, token_hash, user_id, nickname, profile_source, is_manager, created_at, left_at)
    VALUES ('p1', 'r1', 'token1', 'u1', 'Alice', 'account', 1, 1, NULL), ('p2', 'r2', 'token2', 'u1', 'Alice', 'account', 1, 1, NULL),
      ('p3', 'r2', 'token3', 'u1', 'Room custom', 'custom', 0, 1, 1), ('p4', 'r2', 'token4', 'u2', 'Bob', 'account', 0, 1, NULL);
    INSERT INTO participant_access_tokens VALUES ('p2', 'access2', 1);
    INSERT INTO auth_sessions VALUES ('s1', 'u1', 'sessionhash', 1, 9999999999999);
    INSERT INTO playlists (id, owner_user_id, name, kind, created_at, updated_at) VALUES ('list1', 'u1', 'Personal', 'custom', 1, 1);
    INSERT INTO songs (id, room_id, video_id, title, artist, duration_seconds, thumbnail_url, added_by, status, position, created_at)
    VALUES ('song1', 'r2', 'abcdefghijk', 'Song', 'Artist', 180, 'cover', 'p2', 'played', 0, 1);
    INSERT INTO room_feed_entries (id, room_id, entry_type, participant_id, nickname, content, created_at)
    VALUES ('chat1', 'r2', 'message', 'p2', 'Alice', 'Hello', 1), ('chat2', 'r2', 'message', 'p4', 'Bob', 'Hi', 1);`)
  return { db, account: createAccountService(db) }
}
test('custom profiles persist through login and propagate only to account-derived room profiles', async t => {
  const { db, account } = seed(t)
  const updated = account.update('u1', { displayName: 'B-SIDE Alice', avatarUrl: '' })
  assert.equal(updated.user.displayName, 'B-SIDE Alice'); assert.equal(updated.user.avatarUrl, null)
  assert.equal(db.prepare("SELECT nickname FROM participants WHERE id = 'p2'").get().nickname, 'B-SIDE Alice')
  assert.equal(db.prepare("SELECT nickname FROM participants WHERE id = 'p3'").get().nickname, 'Room custom')
  const auth = createDiscordAuth(db, { clientId: 'client', clientSecret: 'secret', redirectUri: 'http://localhost/callback', fetchImpl: async url => new Response(JSON.stringify(String(url).endsWith('/token') ? { access_token: 'token' } : { id: 'd1', username: 'updated', global_name: 'Discord Alice', avatar: 'new-avatar' })) })
  const session = await auth.completeAuthorization('code')
  assert.equal(session.user.displayName, 'B-SIDE Alice'); assert.equal(session.user.avatarUrl, null)
  const synced = await auth.completeAuthorization('code', { createSession: false, syncUserId: 'u1' })
  assert.equal(synced.user.displayName, 'Discord Alice'); assert.match(synced.user.avatarUrl, /new-avatar/)
  assert.equal(synced.sessionToken, null)
})
test('manual Discord sync rejects a different account without creating or updating that account', async t => {
  const { db } = seed(t)
  const auth = createDiscordAuth(db, { clientId: 'client', clientSecret: 'secret', redirectUri: 'http://localhost/callback', fetchImpl: async url => new Response(JSON.stringify(String(url).endsWith('/token') ? { access_token: 'token' } : { id: 'foreign', username: 'foreign-user' })) })
  await assert.rejects(auth.completeAuthorization('code', { createSession: false, syncUserId: 'u1' }), { code: 'DISCORD_ACCOUNT_MISMATCH' })
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM users').get().count, 2)
  assert.equal(publicUser(db.prepare("SELECT * FROM users WHERE id = 'u1'").get()).displayName, 'Alice')
})
test('profile validation prevents external URLs, invalid image data and empty names', t => {
  const { account } = seed(t)
  for (const body of [{ displayName: '' }, { displayName: 'a'.repeat(21) }, { displayName: 'Alice', avatarUrl: 'https://evil.example/image' }, { displayName: 'Alice', avatarUrl: 'data:image/webp;base64,YmFk' }]) {
    assert.throws(() => account.update('u1', body), { code: 'INVALID_ACCOUNT_PROFILE' })
  }
})
test('withdrawal deletes owned rooms and private data, revokes access, anonymizes other room history and deletes own chat', t => {
  const { db, account } = seed(t)
  assert.throws(() => account.remove('u1', 'wrong'), { code: 'INVALID_ACCOUNT_CONFIRMATION' })
  assert.ok(db.prepare("SELECT id FROM users WHERE id = 'u1'").get())
  const removed = account.remove('u1', 'Alice')
  assert.deepEqual(removed.owned, ['ROOM01']); assert.deepEqual(removed.codes, ['ROOM02'])
  for (const table of ['users', 'auth_sessions', 'playlists']) assert.equal(db.prepare(`SELECT * FROM ${table} WHERE ${table === 'users' ? 'id' : table === 'playlists' ? 'owner_user_id' : 'user_id'} = 'u1'`).get(), undefined)
  assert.equal(db.prepare("SELECT id FROM rooms WHERE id = 'r1'").get(), undefined)
  assert.ok(db.prepare("SELECT id FROM rooms WHERE id = 'r2'").get())
  const participant = db.prepare("SELECT * FROM participants WHERE id = 'p2'").get()
  assert.equal(participant.user_id, null); assert.equal(participant.nickname, '탈퇴한 사용자'); assert.equal(participant.is_manager, 0)
  assert.match(participant.token_hash, /^[a-f0-9]{64}$/)
  assert.notEqual(participant.token_hash, db.prepare("SELECT token_hash FROM participants WHERE id = 'p3'").get().token_hash)
  assert.equal(db.prepare('SELECT * FROM participant_access_tokens').get(), undefined)
  assert.equal(db.prepare("SELECT * FROM room_feed_entries WHERE id = 'chat1'").get(), undefined)
  assert.ok(db.prepare("SELECT * FROM room_feed_entries WHERE id = 'chat2'").get())
  assert.ok(db.prepare("SELECT * FROM songs WHERE id = 'song1'").get())
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
})
