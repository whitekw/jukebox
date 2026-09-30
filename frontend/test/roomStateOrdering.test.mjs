import assert from 'node:assert/strict'
import test from 'node:test'
import { preferCurrentPlaybackRevision } from '../src/features/room/roomStateOrdering.ts'

test('a delayed room response cannot roll playback back after a newer event', () => {
  const newer = { code: 'ABC123', playbackRevision: 6, currentSong: { videoId: 'new' } }
  const older = { code: 'ABC123', playbackRevision: 5, currentSong: { videoId: 'old' } }
  assert.equal(preferCurrentPlaybackRevision(newer, older), newer)
  assert.equal(preferCurrentPlaybackRevision(older, newer), newer)
})

test('non-playback room updates and resets still apply', () => {
  const current = { code: 'ABC123', playbackRevision: 6, participants: [] }
  const participantUpdate = { code: 'ABC123', playbackRevision: 6, participants: [{ id: 'guest' }] }
  assert.equal(preferCurrentPlaybackRevision(current, participantUpdate), participantUpdate)
  assert.equal(preferCurrentPlaybackRevision(current, null), null)
  assert.equal(preferCurrentPlaybackRevision(null, participantUpdate), participantUpdate)
})

test('a delayed vote response cannot replace newer totals for the same song', () => {
  const newer = { code: 'ABC123', playbackRevision: 6, currentSong: { id: 'song', voteRevision: 3, upvotes: 1, downvotes: 0 } }
  const older = { code: 'ABC123', playbackRevision: 6, currentSong: { id: 'song', voteRevision: 2, upvotes: 2, downvotes: 0 } }
  assert.equal(preferCurrentPlaybackRevision(newer, older), newer)
  assert.equal(preferCurrentPlaybackRevision(older, newer), newer)
  const nextSong = { code: 'ABC123', playbackRevision: 7, currentSong: { id: 'next', voteRevision: 0 } }
  assert.equal(preferCurrentPlaybackRevision(newer, nextSong), nextSong)
})
