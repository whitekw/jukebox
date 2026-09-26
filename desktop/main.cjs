const path = require('node:path')
const { app, BrowserWindow, Notification, ipcMain, session, shell } = require('electron')
const {
  DEFAULT_SITE_URL,
  siteOrigin,
  isSitePage,
  isAllowedNavigation,
  chatNotification,
} = require('./appUrl.cjs')

const APP_ID = 'com.whitekw.bside'
const siteUrl = siteOrigin(process.env.BSIDE_APP_URL || DEFAULT_SITE_URL)
const smokeTest = process.env.BSIDE_DESKTOP_SMOKE === '1'
let mainWindow = null

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    app.setAppUserModelId(APP_ID)
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
      const pageUrl = details.requestingUrl || webContents.getURL()
      callback(isSitePage(pageUrl, siteUrl) && [
        'clipboard-sanitized-write',
        'fullscreen',
      ].includes(permission))
    })

    mainWindow = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 760,
      minHeight: 540,
      backgroundColor: '#0d0a14',
      show: !smokeTest,
      autoHideMenuBar: true,
      icon: path.join(__dirname, 'assets', 'icon.png'),
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webviewTag: false,
      },
    })

    const openExternal = (target) => {
      try {
        const url = new URL(target)
        if (['http:', 'https:'].includes(url.protocol)) void shell.openExternal(url.href)
      } catch {
        // Ignore malformed external links.
      }
    }
    const guardNavigation = (event) => {
      if (!event.isMainFrame) return
      const target = event.url
      if (isAllowedNavigation(target, siteUrl)) return
      event.preventDefault()
      openExternal(target)
    }
    mainWindow.webContents.on('will-navigate', guardNavigation)
    mainWindow.webContents.on('will-redirect', guardNavigation)
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (isAllowedNavigation(url, siteUrl)) {
        void mainWindow.loadURL(url)
      } else {
        openExternal(url)
      }
      return { action: 'deny' }
    })

    ipcMain.on('desktop:chat', (event, payload) => {
      if (!mainWindow || event.sender !== mainWindow.webContents
        || event.senderFrame !== mainWindow.webContents.mainFrame
        || !isSitePage(event.senderFrame.url, siteUrl)
        || mainWindow.isFocused() || !Notification.isSupported()) return

      const message = chatNotification(payload)
      if (!message) return
      const notification = new Notification({
        title: `${message.nickname} · B-SIDE`,
        body: message.content,
        icon: path.join(__dirname, 'assets', 'icon.png'),
      })
      notification.on('click', () => {
        if (!mainWindow || mainWindow.isDestroyed()) return
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.show()
        mainWindow.focus()
        const page = new URL(mainWindow.webContents.getURL())
        if (page.origin === siteUrl && page.pathname.toUpperCase() === `/ROOM/${message.roomCode}`) {
          mainWindow.webContents.send('desktop:open-chat', message.roomCode)
        }
      })
      notification.show()
    })

    mainWindow.on('closed', () => { mainWindow = null })
    if (smokeTest) {
      mainWindow.webContents.once('did-finish-load', async () => {
        const state = await mainWindow.webContents.executeJavaScript(
          '({ title: document.title, bridge: typeof window.bsideDesktop })',
        )
        process.stdout.write(`BSIDE_SMOKE:${JSON.stringify(state)}\n`)
        app.quit()
      })
      mainWindow.webContents.once('did-fail-load', (_event, errorCode, errorDescription) => {
        process.stderr.write(`BSIDE_SMOKE_ERROR:${errorCode}:${errorDescription}\n`)
        app.exit(1)
      })
    }
    void mainWindow.loadURL(siteUrl)
  })

  app.on('window-all-closed', () => app.quit())
}
