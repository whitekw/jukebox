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
