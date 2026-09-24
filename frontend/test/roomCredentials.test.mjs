import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clearStoredRoomCredentials,
  getStoredRoomCredentials,
  isInvalidRoomCredential,
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

test('only invalidates room credentials on explicit authorization errors', () => {
  assert.equal(
    isInvalidRoomCredential({ status: 401, code: 'ROOM_SESSION_INVALID' }, 'host'),
    true,
  )
  assert.equal(
    isInvalidRoomCredential({ status: 401, code: 'PARTICIPANT_REQUIRED' }, 'participant'),
    true,
  )
  for (const error of [
    new TypeError('Failed to fetch'),
    { status: 503, code: 'ROOM_SESSION_INVALID' },
    { status: 401, code: 'AUTH_REQUIRED' },
    { status: 404, code: 'ROOM_NOT_FOUND' },
  ]) {
    assert.equal(isInvalidRoomCredential(error, 'host'), false)
    assert.equal(isInvalidRoomCredential(error, 'participant'), false)
  }
})
