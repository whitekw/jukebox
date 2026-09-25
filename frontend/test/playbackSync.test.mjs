import assert from 'node:assert/strict'
import test from 'node:test'
import { expectedPlaybackPosition } from '../src/features/room/playback/playbackSync.ts'

const synchronization = {
  positionSeconds: 12,
  anchorAt: 10_000,
  revision: 1,
  serverTimeOffsetMs: 500,
  pending: false,
}

test('advances with server time while playing', () => {
  assert.equal(expectedPlaybackPosition(synchronization, false, 12_500), 15)
})

test('stays at the anchor position while paused or pending', () => {
  assert.equal(expectedPlaybackPosition(synchronization, true, 12_500), 12)
  assert.equal(
    expectedPlaybackPosition({ ...synchronization, pending: true }, false, 12_500),
    12,
  )
})

test('does not seek backwards when the local clock precedes the anchor', () => {
  assert.equal(expectedPlaybackPosition(synchronization, false, 9_000), 12)
})
