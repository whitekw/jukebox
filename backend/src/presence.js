function createRoomPresence(options = {}) {
  const graceMs = options.graceMs ?? 5_000
  const schedule = options.setTimeout ?? setTimeout
  const cancel = options.clearTimeout ?? clearTimeout
  const onParticipantOffline = options.onParticipantOffline ?? (() => {})
  const socketsByRoom = new Map()
  const pendingOfflineTimers = new Map()

  function participantKey(code, participantId) {
    return `${code}:${participantId}`
  }

  function connect(code, participantId, socketId) {
    if (!participantId) return false

    const key = participantKey(code, participantId)
    const pendingTimer = pendingOfflineTimers.get(key)
    if (pendingTimer) {
      cancel(pendingTimer)
      pendingOfflineTimers.delete(key)
    }

    let roomParticipants = socketsByRoom.get(code)
    if (!roomParticipants) {
      roomParticipants = new Map()
      socketsByRoom.set(code, roomParticipants)
    }
    let participantSockets = roomParticipants.get(participantId)
    if (!participantSockets) {
      participantSockets = new Set()
      roomParticipants.set(participantId, participantSockets)
    }
    const becameOnline = participantSockets.size === 0 && !pendingTimer
    participantSockets.add(socketId)
    return becameOnline
  }

  function disconnect(code, participantId, socketId) {
    if (!participantId) return

    const roomParticipants = socketsByRoom.get(code)
    const participantSockets = roomParticipants?.get(participantId)
    if (!participantSockets) return

    participantSockets.delete(socketId)
    if (participantSockets.size > 0) return

    const key = participantKey(code, participantId)
    if (pendingOfflineTimers.has(key)) return

    const timer = schedule(() => {
      pendingOfflineTimers.delete(key)
      const currentRoom = socketsByRoom.get(code)
      const currentSockets = currentRoom?.get(participantId)
      if (!currentRoom || !currentSockets || currentSockets.size > 0) return

      currentRoom.delete(participantId)
      if (currentRoom.size === 0) socketsByRoom.delete(code)
      onParticipantOffline({ code, participantId })
    }, graceMs)
    timer.unref?.()
    pendingOfflineTimers.set(key, timer)
  }

  function getParticipantIds(code) {
    return new Set(socketsByRoom.get(code)?.keys() ?? [])
  }

  function clear() {
    for (const timer of pendingOfflineTimers.values()) cancel(timer)
    pendingOfflineTimers.clear()
    socketsByRoom.clear()
  }

  return { connect, disconnect, getParticipantIds, clear }
}

module.exports = { createRoomPresence }
