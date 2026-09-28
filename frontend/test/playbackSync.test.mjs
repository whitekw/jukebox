import assert from 'node:assert/strict'
import test from 'node:test'
import {
  expectedPlaybackPosition,
  shouldReportPendingPlaybackStart,
} from '../src/features/room/playback/playbackSync.ts'

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

test('an already-playing player acknowledges each new pending revision once', () => {
  const pending = { ...synchronization, pending: true, revision: 2 }
  assert.equal(shouldReportPendingPlaybackStart(pending, 1, true, false), true)
  assert.equal(shouldReportPendingPlaybackStart(pending, 2, true, false), false)
  assert.equal(shouldReportPendingPlaybackStart({ ...pending, revision: 3 }, 2, true, false), true)
  assert.equal(shouldReportPendingPlaybackStart(pending, 1, false, false), false)
  assert.equal(shouldReportPendingPlaybackStart(pending, 1, true, true), false)
  assert.equal(shouldReportPendingPlaybackStart(synchronization, 1, true, false), false)
})
