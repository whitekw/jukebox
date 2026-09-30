import assert from 'node:assert/strict'
import test from 'node:test'
import { groupChatMessages } from '../src/features/room/chat/groupChatMessages.ts'

const start = new Date(2026, 8, 30, 12).getTime()
const message = (id, participantId, offset = 0, nickname = participantId) => ({
  type: 'message', id, participantId, nickname, createdAt: start + offset, content: id,
})

test('groups consecutive messages from the same participant without changing their contents', () => {
  const input = [message('a', 'one'), message('b', 'one', 60_000), message('c', 'two', 90_000)]
  const snapshot = structuredClone(input)
  const groups = groupChatMessages(input)
  assert.deepEqual(groups.map(group => group.messages.map(item => item.id)), [['a', 'b'], ['c']])
  assert.deepEqual(input, snapshot)
})

test('keeps different participants, renamed senders and system events in separate groups', () => {
  const event = { type: 'system', id: 'event', createdAt: start, eventType: 'song_added' }
  const groups = groupChatMessages([
    message('a', 'one', 0, 'Same name'), message('b', 'two', 0, 'Same name'),
    event, message('c', 'two', 0, 'Same name'), message('d', 'two', 0, 'New name'),
  ])
  assert.equal(groups.length, 5)
  assert.equal(groups[2], event)
})

test('starts a new group after five minutes or at a date boundary', () => {
  assert.equal(groupChatMessages([message('a', 'one'), message('b', 'one', 300_000)]).length, 2)
  const beforeMidnight = new Date(2026, 8, 30, 23, 59).getTime()
  assert.equal(groupChatMessages([
    { ...message('a', 'one'), createdAt: beforeMidnight },
    { ...message('b', 'one'), createdAt: beforeMidnight + 120_000 },
  ]).length, 2)
  assert.deepEqual(groupChatMessages([]), [])
})
