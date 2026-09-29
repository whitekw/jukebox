const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('bsideDesktop', {
  notifyChat(message) {
    if (!message || typeof message !== 'object') return
    ipcRenderer.send('desktop:chat', {
      roomCode: message.roomCode,
      nickname: message.nickname,
      content: message.content,
    })
  },
  onOpenChat(callback) {
    if (typeof callback !== 'function') return () => {}
    const listener = (_event, roomCode) => callback(roomCode)
    ipcRenderer.on('desktop:open-chat', listener)
    return () => ipcRenderer.removeListener('desktop:open-chat', listener)
  },
})

if (process.argv.includes('--bside-custom-titlebar') && process.isMainFrame) {
  window.addEventListener('DOMContentLoaded', () => {
    const root = document.documentElement
    root.dataset.bsideDesktop = 'true'
    const style = document.createElement('style')
    style.textContent = `
      #bside-titlebar-fallback {
        height: 48px; display: flex; align-items: center; box-sizing: border-box;
        padding: 0 16px; background: #0b0a10; color: #f6f4ff;
        font: 700 14px system-ui, sans-serif; letter-spacing: .18em;
        -webkit-app-region: drag; user-select: none;
      }
      #bside-titlebar-fallback[hidden] { display: none; }
      html[data-bside-titlebar-fallback] body { min-height: calc(100dvh - 48px); }
      html[data-bside-titlebar-fallback] #root > main:is(.min-h-screen, .min-h-dvh) {
        min-height: calc(100dvh - 48px);
      }
      html[data-bside-titlebar-fallback] #root > main.h-dvh {
        height: calc(100dvh - 48px);
      }
      :fullscreen #bside-titlebar-fallback { display: none; }
    `
    document.head.append(style)
    const fallback = document.createElement('div')
    fallback.id = 'bside-titlebar-fallback'
    fallback.textContent = 'B-SIDE'
    fallback.setAttribute('aria-hidden', 'true')
    document.body.prepend(fallback)

    let currentHeader = null
    let lastHeight = 0
    const updateHeight = () => {
      // Native controls must end above the header's bottom divider. Measuring
      // the border box included that divider and let the overlay paint over it.
      const height = currentHeader
        ? Math.min(144, Math.max(48, currentHeader.clientHeight))
        : 48
      if (height === lastHeight) return
      lastHeight = height
      ipcRenderer.send('desktop:titlebar-height', height)
    }
    const resizeObserver = new ResizeObserver(updateHeight)
    const syncHeader = () => {
      const header = document.querySelector('[data-desktop-titlebar]')
      if (header !== currentHeader) {
        resizeObserver.disconnect()
        currentHeader = header
        if (header) resizeObserver.observe(header)
      }
      const needsFallback = !header
      if (fallback.hidden !== !needsFallback) fallback.hidden = !needsFallback
      if (root.hasAttribute('data-bside-titlebar-fallback') !== needsFallback) {
        root.toggleAttribute('data-bside-titlebar-fallback', needsFallback)
      }
      updateHeight()
    }
    const observer = new MutationObserver(syncHeader)
    observer.observe(document.body, { childList: true, subtree: true })
    // A fixed CSS header can keep the same clientHeight when zoom changes.
    const onViewportResize = () => {
      lastHeight = 0
      updateHeight()
    }
    window.addEventListener('resize', onViewportResize)
    syncHeader()
    window.addEventListener('pagehide', () => {
      observer.disconnect()
      resizeObserver.disconnect()
      window.removeEventListener('resize', onViewportResize)
    }, { once: true })
  }, { once: true })
}
