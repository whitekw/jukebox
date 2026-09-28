import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

const production = JSON.parse(await readFile(new URL('../dist-store/manifest.json', import.meta.url), 'utf8'))
const local = JSON.parse(await readFile(new URL('../dist/manifest.json', import.meta.url), 'utf8'))
const unpacked = JSON.parse(await readFile(new URL('../dist-unpacked/manifest.json', import.meta.url), 'utf8'))

test('Chrome Web Store build has no development key', () => {
  assert.equal(production.key, undefined)
  assert.equal(production.version, '0.1.1')
  assert.deepEqual(production.host_permissions, ['https://bside.whitekw.com/*'])
  assert.equal(local.key, undefined)
})

test('unpacked distribution keeps its existing extension ID', () => {
  const publicKey = Buffer.from(unpacked.key, 'base64')
  const hex = createHash('sha256').update(publicKey).digest('hex').slice(0, 32)
  const id = [...hex].map((digit) => String.fromCharCode(97 + Number.parseInt(digit, 16))).join('')
  assert.equal(id, 'bdobkhgdalimhnpgkhlbghgjafaapfgo')
  assert.deepEqual(unpacked.host_permissions, production.host_permissions)
})
