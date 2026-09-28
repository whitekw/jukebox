import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clampVolume,
  readPlayerAudioSettings,
  writePlayerAudioSettings,
} from '../src/features/room/playback/playerAudioSettings.ts'
import { getLoadedVideoId, shouldReloadMismatchedVideo } from '../src/features/room/playback/youtubeIframe.ts'

test('clamps volume and falls back when saved audio settings are invalid', () => {
  const originalWindow = globalThis.window
  let saved = '{invalid json'
  globalThis.window = {
    localStorage: {
      getItem: () => saved,
      setItem: (_key, value) => { saved = value },
    },
  }
  try {
    assert.equal(clampVolume(112.8), 100)
    assert.deepEqual(readPlayerAudioSettings(35), { volume: 35, muted: false })
    writePlayerAudioSettings({ volume: 70, muted: true })
    assert.deepEqual(readPlayerAudioSettings(35), { volume: 70, muted: true })
  } finally {
    globalThis.window = originalWindow
  }
})

test('extracts the currently loaded YouTube video ID', () => {
  assert.equal(
    getLoadedVideoId({ getVideoUrl: () => 'https://www.youtube.com/watch?v=abc123' }),
    'abc123',
  )
  assert.equal(getLoadedVideoId({ getVideoUrl: () => '' }), '')
})

test('retries a stale video without interrupting an in-progress transition', () => {
  assert.equal(shouldReloadMismatchedVideo('new', '', false, 10_000), false)
  assert.equal(shouldReloadMismatchedVideo('new', 'new', false, 10_000), false)
  assert.equal(shouldReloadMismatchedVideo('new', 'old', false, 1_000), false)
  assert.equal(shouldReloadMismatchedVideo('new', 'old', false, 2_000), true)
  assert.equal(shouldReloadMismatchedVideo('new', 'old', true, 3_000), false)
  assert.equal(shouldReloadMismatchedVideo('new', 'old', true, 8_000), true)
})
