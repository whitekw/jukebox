import assert from 'node:assert/strict'
import test from 'node:test'
import { restoreAccountRoomSession } from '../src/features/room/roomSessionRestore.ts'

const member = {
  participantToken: 'account-token',
  participant: { id: 'account', nickname: 'Account', isMember: true },
  room: {},
}

test('upgrades the current guest after login when the account has not joined yet', async () => {
  const calls = []
  const api = {
    async resumeRoom(code) {
      calls.push(['resume', code])
      throw { code: 'MEMBERSHIP_NOT_FOUND' }
    },
    async getMe(code, token) {
      calls.push(['getMe', code, token])
      return { id: 'guest', nickname: 'dd', isMember: false }
    },
    async joinRoom(code, nickname, token) {
      calls.push(['join', code, nickname, token])
      return member
    },
  }

  assert.equal(await restoreAccountRoomSession('ABC123', 'Account', 'guest-token', api, () => true), member)
  assert.deepEqual(calls, [
    ['resume', 'ABC123'],
    ['getMe', 'ABC123', 'guest-token'],
    ['join', 'ABC123', 'Account', 'guest-token'],
  ])
})

test('resumes an existing account membership before considering a guest token', async () => {
  const api = {
    async resumeRoom() { return member },
    async getMe() { assert.fail('guest token should not be used') },
    async joinRoom() { assert.fail('guest should not be converted') },
  }

  assert.equal(await restoreAccountRoomSession('ABC123', 'Account', 'guest-token', api, () => true), member)
})

test('does not auto-join without a valid previous guest session', async () => {
  const api = {
    async resumeRoom() { throw { code: 'MEMBERSHIP_NOT_FOUND' } },
    async getMe() { throw { status: 401, code: 'PARTICIPANT_REQUIRED' } },
    async joinRoom() { assert.fail('stale token should not create a membership') },
  }

  assert.equal(await restoreAccountRoomSession('ABC123', 'Account', null, api, () => true), null)
  await assert.rejects(
    restoreAccountRoomSession('ABC123', 'Account', 'stale-token', api, () => true),
    { status: 401, code: 'PARTICIPANT_REQUIRED' },
  )
})

test('does not upgrade a guest after the room session effect was cancelled', async () => {
  let active = true
  const api = {
    async resumeRoom() { throw { code: 'MEMBERSHIP_NOT_FOUND' } },
    async getMe() {
      active = false
      return { id: 'guest', nickname: 'dd', isMember: false }
    },
    async joinRoom() { assert.fail('cancelled session should not create a membership') },
  }

  assert.equal(
    await restoreAccountRoomSession('ABC123', 'Account', 'guest-token', api, () => active),
    null,
  )
})
