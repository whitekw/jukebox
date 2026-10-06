import assert from 'node:assert/strict'
import test from 'node:test'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer, loadConfigFromFile } from 'vite'

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`))
  })
}

function close(server) {
  server.closeAllConnections()
  return new Promise((resolve) => server.close(resolve))
}

test('the admin dev proxy preserves the browser origin and host for POST and DELETE requests', async () => {
  const backend = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ method: req.method, host: req.headers.host, origin: req.headers.origin,
      action: req.headers['x-bside-admin-action'] }))
  })
  const backendUrl = await listen(backend)
  let vite
  let proxy
  try {
    const loaded = await loadConfigFromFile({ command: 'serve', mode: 'development' }, path.join(directory, 'vite.config.ts'))
    const configuredProxy = loaded.config.server.proxy['/api']
    // Override only the target port; retain the real configuration's proxy behavior.
    const apiProxy = typeof configuredProxy === 'string' ? backendUrl : { ...configuredProxy, target: backendUrl }
    vite = await createServer({ configFile: false, root: directory, appType: 'custom',
      cacheDir: path.join(directory, 'node_modules/.vite-proxy-test'),
      server: { middlewareMode: true, hmr: false, watch: null, proxy: { '/api': apiProxy } } })
    proxy = http.createServer(vite.middlewares)
    const browserOrigin = await listen(proxy)
    for (const [method, route] of [
      ['POST', '/api/admin/users/test/revoke-sessions'],
      ['DELETE', '/api/admin/rooms/test/participants/test/records'],
    ]) {
      const response = await fetch(`${browserOrigin}${route}`, {
        method, headers: { Origin: browserOrigin, 'X-Bside-Admin-Action': '1' },
      })
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), { method, host: new URL(browserOrigin).host,
        origin: browserOrigin, action: '1' })
    }
  } finally {
    if (proxy) await close(proxy)
    if (vite) await vite.close()
    await close(backend)
  }
})
