import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clearAllStoredRoomCredentials,
  clearStoredRoomCredentials,
  isInvalidRoomCredential,
  isTransientRoomSessionError,
  normalizeRoomCode,
} from '../src/features/room/roomCredentials.ts'

test('normalizes room codes and clears their stored credentials', () => {
  const entries = new Map([
    ['jukebox:host:ABC123', 'host-token'],
    ['jukebox:participant:ABC123', 'participant-token'],
    ['jukebox:host:INVALID!', 'ignored'],
    ['other:host:XYZ987', 'ignored'],
  ])
  const originalStorage = globalThis.localStorage
  globalThis.localStorage = {
    get length() { return entries.size },
    getItem(key) { return entries.get(key) ?? null },
    removeItem(key) { entries.delete(key) },
  }
  try {
    assert.equal(normalizeRoomCode(' abc123 '), 'ABC123')
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

test('retries transient session failures without retrying invalid credentials', () => {
  assert.equal(isTransientRoomSessionError(new TypeError('Failed to fetch')), true)
  assert.equal(isTransientRoomSessionError({ status: 503 }), true)
  assert.equal(isTransientRoomSessionError({ status: 429 }), true)
  assert.equal(
    isTransientRoomSessionError({ status: 401, code: 'ROOM_SESSION_INVALID' }),
    false,
  )
  assert.equal(isTransientRoomSessionError({ status: 404, code: 'ROOM_NOT_FOUND' }), false)
})

test('logout clears room credentials while preserving other preferences', () => {
  const entries = new Map([
    ['jukebox:host:ABC123', 'host-token'],
    ['jukebox:participant:ABC123', 'participant-token'],
    ['jukebox:participant:XYZ987', 'another-participant-token'],
    ['jukebox:locale', 'ko'],
  ])
  const originalStorage = globalThis.localStorage
  globalThis.localStorage = {
    get length() { return entries.size },
    key(index) { return [...entries.keys()][index] ?? null },
    removeItem(key) { entries.delete(key) },
  }
  try {
    clearAllStoredRoomCredentials()
    assert.deepEqual([...entries], [['jukebox:locale', 'ko']])
  } finally {
    globalThis.localStorage = originalStorage
  }
})
