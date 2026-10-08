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

test('restores a saved chat window below the desktop titlebar and fits its height', () => {
  assert.deepEqual(
    clampWindowRect({ x: 200, y: 12, width: 360, height: 700 }, 1000, 600, 80),
    { x: 200, y: 92, width: 360, height: 496 },
  )
})

test('keeps the chat drag header accessible when the desktop titlebar grows', () => {
  const rect = { x: 200, y: 76, width: 360, height: 400 }
  assert.equal(clampWindowRect(rect, 1000, 800, 120).y, 132)
  assert.equal(clampWindowRect(rect, 1000, 800).y, 76)
  const tiny = clampWindowRect(rect, 1000, 150, 144)
  assert.ok(tiny.y >= 12 && tiny.height > 0 && tiny.y + tiny.height <= 138)
})
