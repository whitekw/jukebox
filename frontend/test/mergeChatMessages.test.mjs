import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeChatMessages } from '../src/features/room/chat/mergeChatMessages.ts'

function message(id, createdAt, sequence) {
  return { id, createdAt, sequence }
}

test('merges history and live messages without duplicates in timestamp order', () => {
  const current = [message('live', 20, 3), message('same', 10, 2)]
  const incoming = [message('same', 10, 2), message('earlier', 10, 1)]
  assert.deepEqual(
    mergeChatMessages(current, incoming).map(({ id }) => id),
    ['earlier', 'same', 'live'],
  )
})

test('keeps only the most recent hundred messages', () => {
  const incoming = Array.from({ length: 105 }, (_, index) =>
    message(String(index), index, index),
  )
  const result = mergeChatMessages([], incoming)
  assert.equal(result.length, 100)
  assert.equal(result[0].id, '5')
  assert.equal(result.at(-1).id, '104')
})
