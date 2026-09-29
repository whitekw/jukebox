const assert = require('node:assert/strict')
const http = require('node:http')
const path = require('node:path')
const { spawn } = require('node:child_process')

async function main() {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(`<!doctype html><html><head><title>B-SIDE Smoke</title><style>
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; }
      .min-h-screen { min-height: 100vh; }
      .min-h-dvh { min-height: 100dvh; }
      .h-dvh { height: 100dvh; }
      main { display: grid; place-items: center; padding: 24px; }
      iframe { display: none; }
    </style></head><body><div id="root"><main class="min-h-screen"><h1 style="margin:0">Ready</h1></main></div><iframe src="about:blank"></iframe></body></html>`)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))

  try {
    const electron = require('electron')
    const child = spawn(electron, [path.resolve(__dirname, '..')], {
      cwd: path.resolve(__dirname, '..'),
      env: {
        ...process.env,
        BSIDE_APP_URL: `http://127.0.0.1:${server.address().port}`,
        BSIDE_DESKTOP_SMOKE: '1',
      },
      windowsHide: true,
    })
    let output = ''
    let errors = ''
    child.stdout.on('data', (chunk) => { output += chunk })
    child.stderr.on('data', (chunk) => { errors += chunk })
    const timeout = setTimeout(() => child.kill(), 20_000)
    const exitCode = await new Promise((resolve) => child.on('exit', resolve))
    clearTimeout(timeout)
    assert.equal(exitCode, 0, errors)
    assert.match(output, /BSIDE_SMOKE:\{"title":"B-SIDE Smoke","bridge":"object"\}/)
    process.stdout.write('Electron loaded the site, exposed the desktop bridge and verified native title bar transitions.\n')
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
