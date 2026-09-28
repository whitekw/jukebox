const test = require('node:test')
const assert = require('node:assert/strict')
const { DEFAULT_SITE_URL, siteOrigin, isSitePage, isAllowedNavigation, chatNotification } = require('../appUrl.cjs')

test('the installed app opens the HTTPS production site by default', () => {
  assert.equal(DEFAULT_SITE_URL, 'https://bside.whitekw.com')
  assert.equal(siteOrigin(), DEFAULT_SITE_URL)
})

test('only the configured site and Discord can navigate in the app window', () => {
  const origin = siteOrigin('http://localhost:5173')
  assert.equal(isSitePage('http://localhost:5173/room/ABC123', origin), true)
  assert.equal(isSitePage('https://localhost:5173/', origin), false)
  assert.equal(isAllowedNavigation('https://discord.com/oauth2/authorize', origin), true)
  assert.equal(isAllowedNavigation('https://evil-discord.com/', origin), false)
  assert.throws(() => siteOrigin('https://example.com/path'))
})

test('notification payload accepts room chat and rejects malformed or oversized messages', () => {
  assert.deepEqual(chatNotification({
    roomCode: 'ABC123', nickname: ' Friend ', content: ' Hello ',
  }), { roomCode: 'ABC123', nickname: 'Friend', content: 'Hello' })
  assert.equal(chatNotification({ roomCode: '../BAD', nickname: 'Friend', content: 'Hi' }), null)
  assert.equal(chatNotification({ roomCode: 'ABC123', nickname: 'Friend', content: 'x'.repeat(301) }), null)
})
