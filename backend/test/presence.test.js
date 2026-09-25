const test = require('node:test')
const assert = require('node:assert/strict')
const { createRoomPresence } = require('../src/presence')

function createFakeTimers() {
  const timers = []
  return {
    timers,
    setTimeout(callback) {
      const timer = {
        callback,
        cleared: false,
        unref() {},
      }
      timers.push(timer)
      return timer
    },
    clearTimeout(timer) {
      timer.cleared = true
    },
    run(timer) {
      if (!timer.cleared) timer.callback()
    },
  }
}

test('keeps a participant online until their final socket leaves', () => {
  const timers = createFakeTimers()
  const offline = []
  const presence = createRoomPresence({
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    onParticipantOffline: (event) => offline.push(event),
  })

  assert.equal(presence.connect('ABC123', 'alice', 'socket-1'), true)
  assert.equal(presence.connect('ABC123', 'alice', 'socket-2'), false)
  presence.disconnect('ABC123', 'alice', 'socket-1')

  assert.deepEqual([...presence.getParticipantIds('ABC123')], ['alice'])
  assert.equal(timers.timers.length, 0)
  assert.deepEqual(offline, [])
})

test('cancels leaving when a participant reconnects during the grace period', () => {
  const timers = createFakeTimers()
  const offline = []
  const presence = createRoomPresence({
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    now: () => 1_234,
    onParticipantOffline: (event) => offline.push(event),
  })

  assert.equal(presence.connect('ABC123', 'alice', 'socket-1'), true)
  presence.disconnect('ABC123', 'alice', 'socket-1')
  const originalTimer = timers.timers[0]
  assert.equal(presence.connect('ABC123', 'alice', 'socket-2'), false)
  timers.run(originalTimer)

  assert.deepEqual([...presence.getParticipantIds('ABC123')], ['alice'])
  assert.deepEqual(offline, [])

  presence.disconnect('ABC123', 'alice', 'socket-2')
  timers.run(timers.timers[1])

  assert.deepEqual([...presence.getParticipantIds('ABC123')], [])
  assert.deepEqual(offline, [{ code: 'ABC123', participantId: 'alice', offlineSince: 1_234 }])
})

test('removes every socket and pending offline timer when a member leaves', () => {
  const timers = createFakeTimers()
  const offline = []
  const presence = createRoomPresence({
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    onParticipantOffline: (event) => offline.push(event),
  })

  presence.connect('ABC123', 'member', 'socket-1')
  presence.disconnect('ABC123', 'member', 'socket-1')
  presence.removeParticipant('ABC123', 'member')
  timers.run(timers.timers[0])

  assert.deepEqual([...presence.getParticipantIds('ABC123')], [])
  assert.deepEqual(offline, [])
})
