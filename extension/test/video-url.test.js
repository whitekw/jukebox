import test from 'node:test'
import assert from 'node:assert/strict'
import { extractYouTubeVideoId } from '../src/video-url.js'

test('extracts video IDs from YouTube links in the browser context menu', () => {
  assert.equal(extractYouTubeVideoId('https://www.youtube.com/watch?v=abcdefghijk&t=30'), 'abcdefghijk')
  assert.equal(extractYouTubeVideoId('https://music.youtube.com/watch?v=abcdefghijk'), 'abcdefghijk')
  assert.equal(extractYouTubeVideoId('https://www.youtube.com/shorts/abcdefghijk'), 'abcdefghijk')
  assert.equal(extractYouTubeVideoId('https://youtu.be/abcdefghijk'), 'abcdefghijk')
  assert.equal(extractYouTubeVideoId('https://www.youtube.com/playlist?list=abcdefghijk'), null)
  assert.equal(extractYouTubeVideoId('https://evil.example/watch?v=abcdefghijk'), null)
})
