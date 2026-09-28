import test from 'node:test'
import assert from 'node:assert/strict'

const handlers = {}
const storage = new Map()
const requests = []
let nextNotice
let shownNotice
let readyAllowed = true

globalThis.chrome = {
  contextMenus: {
    create: (properties) => { handlers.menu = properties },
    onClicked: { addListener: (listener) => { handlers.clicked = listener } },
  },
  runtime: {
    id: 'a'.repeat(32),
    onInstalled: { addListener: (listener) => { handlers.installed = listener } },
    onMessage: { addListener: (listener) => { handlers.message = listener } },
    getURL: (path) => `chrome-extension://${'a'.repeat(32)}/${path}`,
  },
  identity: {
    getRedirectURL: (path) => `https://${'a'.repeat(32)}.chromiumapp.org/${path}`,
    launchWebAuthFlow: async ({ url }) => {
      const start = new URL(url)
      const redirect = new URL(start.searchParams.get('redirect_uri'))
      redirect.searchParams.set('state', start.searchParams.get('state'))
      redirect.searchParams.set('grant', 'g'.repeat(43))
      return redirect.toString()
    },
  },
  notifications: {
    create: async (notice) => {
      shownNotice = notice
      nextNotice?.(notice)
    },
  },
  storage: {
    local: {
      setAccessLevel: async () => {},
      get: async (keys) => {
        const names = Array.isArray(keys) ? keys : [keys]
        return Object.fromEntries(names.map((key) => [key, storage.get(key)]))
      },
      set: async (items) => {
        for (const [key, value] of Object.entries(items)) storage.set(key, value)
      },
      remove: async (keys) => {
        for (const key of keys) storage.delete(key)
      },
    },
  },
}

globalThis.fetch = async (url, init = {}) => {
  const path = new URL(url).pathname
  requests.push({ url, path, init })
  if (path === '/api/extension/auth/ready') {
    return Response.json({ enabled: true, extensionAllowed: readyAllowed })
  }
  if (path === '/api/extension/auth/exchange') {
    return Response.json({ token: 't'.repeat(43), expiresAt: Date.now() + 60_000 })
  }
  if (path === '/api/extension/me') {
    return Response.json({ user: { displayName: 'Listener' } })
  }
  if (path === '/api/extension/rooms') {
    return Response.json({ items: [{ code: 'ABC234', currentSongTitle: null, onlineCount: 0 }] })
  }
  if (path === '/api/extension/rooms/ABC234/songs') {
    return Response.json({ currentSong: { videoId: 'abcdefghijk' } })
  }
  if (path === '/api/extension/logout') {
    return new Response(null, { status: 204 })
  }
  throw new Error(`Unexpected request: ${path}`)
}

await import('../dist/background.js')

function send(type, fields = {}) {
  return new Promise((resolve) => {
    handlers.message({ type, ...fields }, {}, resolve)
  })
}

function waitForNotice() {
  return new Promise((resolve) => { nextNotice = resolve })
}

test('registers a link context menu and completes account login', async () => {
  handlers.installed()
  assert.equal(handlers.menu.title, 'B-SIDE 대기열에 추가')
  assert.deepEqual(handlers.menu.contexts, ['link'])

  const response = await send('LOGIN')
  assert.equal(response.ok, true)
  assert.equal(response.state.loggedIn, true)
  assert.equal(response.state.selectedRoom, 'ABC234')
  assert.equal(storage.get('session').token, 't'.repeat(43))
  const exchanged = requests.find((request) => request.path === '/api/extension/auth/exchange')
  assert.equal(JSON.parse(exchanged.init.body).grant, 'g'.repeat(43))
  assert.equal(JSON.parse(exchanged.init.body).codeVerifier.length, 43)
  assert.equal(JSON.parse(exchanged.init.body).extensionId, 'a'.repeat(32))
  assert.equal(
    new URL(requests.find((request) => request.path === '/api/extension/auth/ready').url).searchParams.get('extension_id'),
    'a'.repeat(32),
  )
})

test('adds a linked YouTube video to the selected member room', async () => {
  const notified = waitForNotice()
  handlers.clicked({
    menuItemId: 'add-to-bside',
    linkUrl: 'https://www.youtube.com/watch?v=abcdefghijk&t=10',
  })
  const notice = await notified
  assert.equal(notice.title, 'B-SIDE 대기열에 추가됨')
  const added = requests.find((request) => request.path === '/api/extension/rooms/ABC234/songs')
  assert.equal(added.init.method, 'POST')
  assert.equal(added.init.headers.Authorization, `Bearer ${'t'.repeat(43)}`)
  assert.deepEqual(JSON.parse(added.init.body), { videoId: 'abcdefghijk' })
})

test('requires login again after extension logout', async () => {
  const loggedOut = await send('LOGOUT')
  assert.equal(loggedOut.ok, true)
  assert.equal(storage.has('session'), false)
  const notified = waitForNotice()
  handlers.clicked({ menuItemId: 'add-to-bside', linkUrl: 'https://youtu.be/abcdefghijk' })
  assert.match((await notified).message, /Discord로 로그인/)
  assert.equal(shownNotice.iconUrl.startsWith('chrome-extension://'), true)
})

test('explains how to allow an unregistered extension before opening Discord', async () => {
  readyAllowed = false
  try {
    const response = await send('LOGIN')
    assert.equal(response.ok, false)
    assert.match(response.message, /BROWSER_EXTENSION_IDS/)
    assert.match(response.message, /http:\/\/localhost:5173/)
    assert.match(response.message, new RegExp('a'.repeat(32)))
  } finally {
    readyAllowed = true
  }
})
