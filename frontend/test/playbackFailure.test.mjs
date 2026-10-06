import assert from 'node:assert/strict'
import test from 'node:test'
import { createPlaybackFailureReport, retryPlaybackFailureReport } from '../src/features/room/playback/playbackFailure.ts'

test('retries an unavailable video after a failed request without requiring another player error', async () => {
  const failure = createPlaybackFailureReport()
  failure.errorCode = 150
  let calls = 0
  const report = async (errorCode) => {
    assert.equal(errorCode, 150)
    return ++calls > 1
  }
  await retryPlaybackFailureReport(failure, () => true, report)
  assert.equal(failure.reported, false)
  await retryPlaybackFailureReport(failure, () => true, report)
  assert.equal(failure.reported, true)
  await retryPlaybackFailureReport(failure, () => true, report)
  assert.equal(calls, 2)
})

test('a rejected request releases the pending flag for a later retry', async () => {
  const failure = createPlaybackFailureReport()
  failure.errorCode = 100
  await retryPlaybackFailureReport(failure, () => true, async () => { throw new Error('offline') })
  assert.equal(failure.pending, false)
  assert.equal(failure.reported, false)
  await retryPlaybackFailureReport(failure, () => true, async () => true)
  assert.equal(failure.reported, true)
})

test('deduplicates reports while a request is in flight', async () => {
  const failure = createPlaybackFailureReport()
  failure.errorCode = 101
  let finish
  let calls = 0
  const report = () => { calls++; return new Promise((resolve) => { finish = resolve }) }
  const pending = retryPlaybackFailureReport(failure, () => true, report)
  await retryPlaybackFailureReport(failure, () => true, report)
  assert.equal(calls, 1)
  assert.equal(failure.pending, true)
  finish(true)
  await pending
  assert.equal(failure.reported, true)
})

test('does not retry an old song or carry its late response into the next session', async () => {
  const oldFailure = createPlaybackFailureReport()
  oldFailure.errorCode = 150
  const nextFailure = createPlaybackFailureReport()
  let current = oldFailure
  let finish
  let calls = 0
  const report = () => { calls++; return new Promise((resolve) => { finish = resolve }) }
  const pending = retryPlaybackFailureReport(oldFailure, () => current === oldFailure, report)
  current = nextFailure
  finish(false)
  await pending
  await retryPlaybackFailureReport(oldFailure, () => current === oldFailure, report)
  await retryPlaybackFailureReport(nextFailure, () => true, report)
  assert.equal(calls, 1)
  assert.deepEqual(nextFailure, { errorCode: null, pending: false, reported: false })
})
