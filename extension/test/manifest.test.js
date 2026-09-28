import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

const production = JSON.parse(await readFile(new URL('../dist-production/manifest.json', import.meta.url), 'utf8'))
const local = JSON.parse(await readFile(new URL('../dist/manifest.json', import.meta.url), 'utf8'))

test('production build uses the stable extension ID', () => {
  const publicKey = Buffer.from(production.key, 'base64')
  const hex = createHash('sha256').update(publicKey).digest('hex').slice(0, 32)
  const id = [...hex].map((digit) => String.fromCharCode(97 + Number.parseInt(digit, 16))).join('')
  assert.equal(id, 'bdobkhgdalimhnpgkhlbghgjafaapfgo')
  assert.equal(production.version, '0.1.1')
  assert.deepEqual(production.host_permissions, ['http://bside.whitekw.com/*'])
  assert.equal(local.key, undefined)
})
