const test = require('node:test')
const assert = require('node:assert/strict')
const { createDatabase } = require('../src/db')
const { createRoomService } = require('../src/rooms')
const { buildPlaybackSeries } = require('../src/roomStats')

function song(videoId) {
  return { videoId, title: videoId, artist: 'Artist', durationSeconds: 180, thumbnailUrl: 'image' }
}

test('groups room playback by local day, Monday-start week and month', () => {
  const timestamps = [
    Date.parse('2026-09-29T15:30:00Z'),
    Date.parse('2026-09-30T15:30:00Z'),
  ]
  const series = buildPlaybackSeries(timestamps, Date.parse('2026-10-02T12:00:00Z'), 'Asia/Seoul')
  assert.equal(series.daily.find(({ key }) => key === '2026-09-30').count, 1)
  assert.equal(series.daily.find(({ key }) => key === '2026-10-01').count, 1)
  assert.equal(series.weekly.find(({ key }) => key === '2026-09-28').count, 2)
  assert.equal(series.monthly.find(({ key }) => key === '2026-09').count, 1)
  assert.equal(series.monthly.find(({ key }) => key === '2026-10').count, 1)
  assert.equal(series.daily.at(-1).key, '2026-10-02')
})

test('all participants can see starts and received votes without voter identities', () => {
  const db = createDatabase()
  let clock = Date.parse('2026-09-29T15:30:00Z')
  try {
    const rooms = createRoomService(db, { now: () => clock })
    db.prepare(`INSERT INTO users (id, discord_id, username, created_at, updated_at, last_login_at)
      VALUES ('owner', 'discord-owner', 'Owner', 1, 1, 1)`).run()
    db.prepare(`INSERT INTO users (id, discord_id, username, created_at, updated_at, last_login_at)
      VALUES ('requester', 'discord-requester', 'Requester', 1, 1, 1)`).run()
    const created = rooms.createRoom({ ownerUserId: 'owner', nickname: 'Host' })
    const requester = rooms.joinRoom(created.code, { nickname: 'Requester', userId: 'requester' })
    const listener = rooms.joinRoom(created.code, { nickname: 'Listener' })
    const guest = rooms.joinRoom(created.code, { nickname: 'Guest' })
    const empty = rooms.getRoomStats(created.code, { participantToken: guest.participantToken }, 'Asia/Seoul')
    assert.equal(empty.totalPlays, 0)
    assert.ok(empty.daily.every(({ count }) => count === 0))
    const first = rooms.addSong(created.code, requester.participantToken, song('first'), 'requester')
    rooms.setSongVote(created.code, { participantToken: listener.participantToken }, first.currentSong.id, 'up')
    rooms.addSong(created.code, requester.participantToken, song('second'), 'requester')
    assert.equal(rooms.getRoomStats(created.code, { participantToken: guest.participantToken }).totalPlays, 1)
    clock = Date.parse('2026-09-30T15:30:00Z')
    const second = rooms.advance(created.code, { hostToken: created.hostToken })
    rooms.setSongVote(created.code, { participantToken: listener.participantToken }, second.currentSong.id, 'down')
    rooms.addSong(created.code, guest.participantToken, song('guest-song'))
    rooms.advance(created.code, { hostToken: created.hostToken })

    const stats = rooms.getRoomStats(created.code, { participantToken: guest.participantToken }, 'Asia/Seoul')
    assert.deepEqual([stats.totalPlays, stats.totalUpvotes, stats.totalDownvotes], [3, 1, 1])
    assert.equal(stats.hasEstimatedHistory, false)
    assert.equal(stats.daily.find(({ key }) => key === '2026-09-30').count, 1)
    assert.equal(stats.daily.find(({ key }) => key === '2026-10-01').count, 2)
    const requesterStats = stats.participants.find(({ id }) => id === requester.participant.id)
    assert.deepEqual({
      id: requesterStats.id, nickname: requesterStats.nickname, avatarUrl: requesterStats.avatarUrl,
      plays: requesterStats.plays, upvotes: requesterStats.upvotes, downvotes: requesterStats.downvotes,
    }, {
      id: requester.participant.id, nickname: 'Requester', avatarUrl: null,
      plays: 2, upvotes: 1, downvotes: 1,
    })
    assert.equal(requesterStats.daily.find(({ key }) => key === '2026-09-30').count, 1)
    assert.equal(requesterStats.daily.find(({ key }) => key === '2026-10-01').count, 1)
    assert.equal(requesterStats.weekly.find(({ key }) => key === '2026-09-28').count, 2)
    assert.equal(requesterStats.monthly.find(({ key }) => key === '2026-09').count, 1)
    assert.equal(requesterStats.monthly.find(({ key }) => key === '2026-10').count, 1)
    assert.equal(requesterStats.daily.length, stats.daily.length)
    assert.deepEqual(stats.participants.map(({ id }) => id), [requester.participant.id])
    assert.equal(stats.participants.some((participant) => 'voterId' in participant || 'votesCast' in participant), false)
    assert.throws(() => rooms.getRoomStats(created.code, {}, 'Asia/Seoul'), { code: 'PARTICIPANT_REQUIRED' })
    assert.throws(() => rooms.getRoomStats(created.code, { participantToken: guest.participantToken }, 'Invalid/Zone'), {
      code: 'INVALID_TIME_ZONE',
    })
  } finally {
    db.close()
  }
})
