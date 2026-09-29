const assert = require('node:assert/strict')

async function runTitleBarSmoke(window, customTitleBar) {
  const page = (script) => window.webContents.executeJavaScript(script)
  const state = await page('({ title: document.title, bridge: typeof window.bsideDesktop })')
  if (!customTitleBar) return state
  // Render the native window so Chromium dispatches viewport changes during
  // zoom tests. Keep it off screen without taking focus from the user's app.
  window.webContents.setBackgroundThrottling(false)
  window.setPosition(-10000, -10000)
  window.showInactive()

  const read = () => page(`({
    fallbackVisible: !document.getElementById('bside-titlebar-fallback').hidden,
    overlayHeight: navigator.windowControlsOverlay.getTitlebarAreaRect().height,
    fallback: document.documentElement.hasAttribute('data-bside-titlebar-fallback'),
    childHasTitlebar: document.querySelector('iframe').contentDocument.documentElement.hasAttribute('data-bside-desktop'),
    drag: getComputedStyle(document.getElementById('bside-titlebar-fallback')).webkitAppRegion
  })`)
  const waitFor = async (expected) => {
    for (let attempt = 0; attempt < 50; attempt++) {
      const result = await read()
      if (Object.entries(expected).every(([key, value]) => result[key] === value)) return result
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    assert.fail(`Title bar did not update: ${JSON.stringify(await read())}`)
  }
  // A page without the new web header still has a draggable title bar. Preload
  // must not inject extra title bars into embedded content.
  await waitFor({ fallbackVisible: true, fallback: true, childHasTitlebar: false, drag: 'drag' })
  const assertFitsViewport = async () => {
    const bounds = await page(`({
      viewport: innerHeight,
      documentHeight: document.documentElement.scrollHeight,
      mainHeight: document.querySelector('main').getBoundingClientRect().height,
      messageCenter: (() => {
        const rect = document.querySelector('h1').getBoundingClientRect();
        return rect.top + rect.height / 2;
      })()
    })`)
    assert.equal(bounds.documentHeight, bounds.viewport, 'Fallback must not add a page scrollbar')
    assert.equal(bounds.mainHeight, bounds.viewport - 48)
    assert.equal(bounds.messageCenter, 48 + (bounds.viewport - 48) / 2)
  }
  // Loading/not-found screens use minimum height; the older room layout uses
  // fixed height. Both must fit below the fallback without suppressing overflow.
  for (const className of ['min-h-screen', 'min-h-dvh', 'h-dvh']) {
    await page(`document.querySelector('main').className = ${JSON.stringify(className)}`)
    await assertFitsViewport()
  }
  await page("document.querySelector('main').className = 'min-h-screen'")
  await page(`{
    const content = document.createElement('div');
    content.id = 'long-content';
    content.style.height = '1200px';
    document.querySelector('main').append(content);
  }`)
  assert.equal(await page('document.documentElement.scrollHeight > innerHeight'), true,
    'Long content must still scroll naturally')
  await page("document.getElementById('long-content').remove()")
  await page(`{
    const header = document.createElement('header');
    header.dataset.desktopTitlebar = '';
    header.style.height = '72px';
    document.body.append(header);
  }`)
  await waitFor({ fallbackVisible: false, fallback: false, overlayHeight: 72 })
  assert.equal(await page("document.querySelector('main').getBoundingClientRect().height === innerHeight"), true,
    'Integrated headers must not leave the fallback height compensation active')
  // Real web headers use border-box sizing and a bottom divider. Caption
  // controls must leave that divider visible instead of protruding below it.
  await page(`{
    const header = document.querySelector('header');
    header.style.boxSizing = 'border-box';
    header.style.borderBottom = '1px solid white';
  }`)
  await waitFor({ overlayHeight: 71 })
  // Responsive headers resize native controls without covering the content.
  await page("document.querySelector('header').style.height = '96px'")
  await waitFor({ overlayHeight: 95 })
  for (const factor of [0.5, 0.75, 0.9, 1.25, 1.5, 1]) {
    window.webContents.setZoomFactor(factor)
    await waitFor({ overlayHeight: Math.ceil(Math.floor(95 * factor) / factor) })
    const geometry = await page(`({
      overlay: navigator.windowControlsOverlay.getTitlebarAreaRect().height,
      header: document.querySelector('header').clientHeight,
    })`)
    assert.ok(geometry.overlay <= geometry.header,
      `Caption controls protrude at zoom ${factor}: ${JSON.stringify(geometry)}`)
    assert.ok(geometry.header - geometry.overlay <= Math.ceil(1 / factor),
      `Caption controls are too short at zoom ${factor}: ${JSON.stringify(geometry)}`)
  }
  // Client-side route changes retain the same renderer and header observer.
  // Resetting native controls here would leave them stuck at fallback height.
  await page("history.pushState({}, '', '/room/ABC234')")
  await new Promise((resolve) => setTimeout(resolve, 50))
  assert.equal((await read()).overlayHeight, 95)
  // SPA transitions back to a loading/error screen restore the fallback.
  await page("document.querySelector('header').remove()")
  await waitFor({ fallbackVisible: true, fallback: true, overlayHeight: 48 })
  await assertFitsViewport()
  window.webContents.setZoomFactor(0.9)
  await waitFor({ overlayHeight: Math.ceil(Math.floor(48 * 0.9) / 0.9) })
  window.webContents.setZoomFactor(1)
  await waitFor({ overlayHeight: 48 })
  return state
}

module.exports = { runTitleBarSmoke }
