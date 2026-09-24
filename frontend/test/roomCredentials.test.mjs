import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clearStoredRoomCredentials,
  getStoredRoomCredentials,
  normalizeRoomCode,
} from '../src/features/room/roomCredentials.ts'

test('normalizes room codes and reads only valid stored credentials', () => {
  const entries = new Map([
    ['jukebox:host:ABC123', 'host-token'],
    ['jukebox:participant:ABC123', 'participant-token'],
    ['jukebox:host:INVALID!', 'ignored'],
    ['other:host:XYZ987', 'ignored'],
  ])
  const originalStorage = globalThis.localStorage
  globalThis.localStorage = {
    get length() { return entries.size },
    key(index) { return [...entries.keys()][index] ?? null },
    getItem(key) { return entries.get(key) ?? null },
    removeItem(key) { entries.delete(key) },
  }
  try {
    assert.equal(normalizeRoomCode(' abc123 '), 'ABC123')
    assert.deepEqual(getStoredRoomCredentials(), [{
      code: 'ABC123',
      hostToken: 'host-token',
      participantToken: 'participant-token',
    }])
    clearStoredRoomCredentials('abc123')
    assert.equal(entries.has('jukebox:host:ABC123'), false)
    assert.equal(entries.has('jukebox:participant:ABC123'), false)
  } finally {
    globalThis.localStorage = originalStorage
  }
})
