import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeRoomHistory } from '../src/features/room/components/mergeRoomHistory.ts'

test('keeps loaded older playback pages when a newer song finishes', () => {
  const current = [{ id: 'newest' }, { id: 'middle' }, { id: 'oldest' }]
  const refreshed = [{ id: 'finished' }, { id: 'newest' }, { id: 'middle' }]
  assert.deepEqual(mergeRoomHistory(current, refreshed).map(({ id }) => id),
    ['finished', 'newest', 'middle', 'oldest'])
})
