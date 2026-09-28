import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))
const local = process.argv.includes('--local')
const unpacked = process.argv.includes('--unpacked')
if (local && unpacked) throw new Error('Choose either --local or --unpacked.')
const origin = local ? 'http://localhost:5173' : 'https://bside.whitekw.com'
const output = path.join(root, local ? 'dist' : unpacked ? 'dist-unpacked' : 'dist-store')
const publicKey = unpacked ? (await readFile(path.join(root, 'production-public-key.txt'), 'utf8')).trim() : null

await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })
await cp(path.join(root, 'src'), output, { recursive: true })
await cp(path.join(root, 'store-assets', 'icon-128.png'), path.join(output, 'icon.png'))
await writeFile(path.join(output, 'config.js'), `export const API_ORIGIN = ${JSON.stringify(origin)}\n`)
await writeFile(path.join(output, 'manifest.json'), JSON.stringify({
  manifest_version: 3,
  name: local ? 'B-SIDE 대기열 (로컬)' : 'B-SIDE 대기열',
  ...(publicKey ? { key: publicKey } : {}),
  description: 'YouTube 영상 링크를 우클릭해 참여 중인 B-SIDE 방 대기열에 추가합니다.',
  version: local ? '0.1.0' : '0.1.1',
  permissions: ['contextMenus', 'identity', 'storage', 'notifications'],
  host_permissions: [`${origin}/*`],
  background: { service_worker: 'background.js', type: 'module' },
  action: { default_popup: 'popup.html', default_icon: 'icon.png' },
  icons: { '128': 'icon.png' },
}, null, 2) + '\n')

console.log(`Built B-SIDE extension for ${origin}: ${output}`)
