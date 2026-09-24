import assert from 'node:assert/strict'
import test from 'node:test'
import { getRoomPermissions } from '../src/features/room/roomPermissions.ts'

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
