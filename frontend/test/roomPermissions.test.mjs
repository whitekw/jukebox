import assert from 'node:assert/strict'
import test from 'node:test'
import { canControlSong, canReportPlaybackFailure, getRoomPermissions } from '../src/features/room/roomPermissions.ts'

const room = {
  participants: [
    { id: 'listener', isManager: false },
    { id: 'manager', isManager: true },
  ],
}

function permissions(overrides = {}) {
  return getRoomPermissions({
    room,
    participant: null,
    hostToken: '',
    participantToken: '',
    isOwner: false,
    ...overrides,
  })
}

test('a guest cannot control playback or change songs', () => {
  assert.deepEqual(permissions(), {
    isManager: false,
    isController: false,
    controlCredentials: null,
    songActionCredentials: null,
  })
})

test('a listener can use their own song credentials without room control', () => {
  const result = permissions({
    participant: { id: 'listener' },
    participantToken: 'participant-token',
  })
  assert.equal(result.isController, false)
  assert.deepEqual(result.songActionCredentials, {
    participantToken: 'participant-token',
  })
})

test('a manager controls the room with their participant token', () => {
  const result = permissions({
    participant: { id: 'manager' },
    participantToken: 'participant-token',
  })
  assert.equal(result.isManager, true)
  assert.deepEqual(result.controlCredentials, {
    participantToken: 'participant-token',
  })
})

test('an owner without a participant token still has room control', () => {
  const result = permissions({ isOwner: true })
  assert.equal(result.isController, true)
  assert.deepEqual(result.controlCredentials, {})
})

test('a host sends both tokens when also joined as a participant', () => {
  const result = permissions({
    hostToken: 'host-token',
    participantToken: 'participant-token',
  })
  assert.deepEqual(result.controlCredentials, {
    hostToken: 'host-token',
    participantToken: 'participant-token',
  })
  assert.deepEqual(result.songActionCredentials, result.controlCredentials)
})

test('a listener can control another requester song only after its one-minute deadline', () => {
  const song = { addedById: 'requester', otherControlAvailableAt: 61_000 }
  assert.equal(canControlSong(song, 'listener', false, 60_999), false)
  assert.equal(canControlSong(song, 'listener', false, 61_000), true)
  assert.equal(canControlSong(song, undefined, false, 61_000), false)
  assert.equal(canControlSong({ ...song, otherControlAvailableAt: null }, 'listener', false, 61_000), false)
  assert.equal(canControlSong(song, 'requester', false, 1_000), true)
  assert.equal(canControlSong(song, undefined, true, 1_000), true)
})

test('all-device failure reports require the same song control as ordinary skips', () => {
  const room = { playbackMode: 'all_devices', currentSong: { addedById: 'requester', otherControlAvailableAt: null } }
  assert.equal(canReportPlaybackFailure(room, 'listener', false, false, 1_000), false)
  assert.equal(canReportPlaybackFailure(room, 'requester', false, false, 1_000), true)
  assert.equal(canReportPlaybackFailure(room, 'manager', true, false, 1_000), true)
  assert.equal(canReportPlaybackFailure(room, undefined, true, false, 1_000), true)
  assert.equal(canReportPlaybackFailure({ ...room, currentSong: null }, 'requester', false, false, 1_000), false)
  const abandoned = { ...room, currentSong: { ...room.currentSong, otherControlAvailableAt: 61_000 } }
  assert.equal(canReportPlaybackFailure(abandoned, 'listener', false, false, 60_999), false)
  assert.equal(canReportPlaybackFailure(abandoned, 'listener', false, false, 61_000), true)
})

test('host-only failure reports require the actual playback host', () => {
  const room = { playbackMode: 'host_only', currentSong: { addedById: 'requester', otherControlAvailableAt: null } }
  assert.equal(canReportPlaybackFailure(room, 'requester', false, false, 1_000), false)
  assert.equal(canReportPlaybackFailure(room, 'manager', true, false, 1_000), false)
  assert.equal(canReportPlaybackFailure(room, undefined, true, true, 1_000), true)
})
