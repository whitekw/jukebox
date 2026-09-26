import assert from 'node:assert/strict'
import test from 'node:test'
import { shouldNotifyDesktopChat } from '../src/features/room/desktopBridge.ts'

const otherMessage = {
  type: 'message', participantId: 'other', nickname: 'Friend', content: 'Hello',
}

test('desktop notifications are only for other participants live chat messages', () => {
  assert.equal(shouldNotifyDesktopChat(otherMessage, 'me'), true)
  assert.equal(shouldNotifyDesktopChat({ ...otherMessage, participantId: 'me' }, 'me'), false)
  assert.equal(shouldNotifyDesktopChat({ ...otherMessage, type: 'system' }, 'me'), false)
  assert.equal(shouldNotifyDesktopChat(otherMessage, ''), false)
})
