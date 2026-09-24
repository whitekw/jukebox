import assert from 'node:assert/strict'
import test from 'node:test'
import { clampWindowRect } from '../src/features/room/chat/chatWindowGeometry.ts'

test('keeps a dragged chat window inside the viewport', () => {
  assert.deepEqual(
    clampWindowRect({ x: 900, y: -40, width: 400, height: 560 }, 1000, 800),
    { x: 588, y: 12, width: 400, height: 560 },
  )
})

test('fits the chat window on a viewport narrower than its minimum size', () => {
  assert.deepEqual(
    clampWindowRect({ x: 50, y: 20, width: 400, height: 560 }, 300, 500),
    { x: 12, y: 12, width: 276, height: 476 },
  )
})
