export function normalizeRoomCode(code: string | undefined) {
  return String(code ?? '').trim().toUpperCase()
}

export function hostTokenKey(code: string) {
  return `jukebox:host:${normalizeRoomCode(code)}`
}

export function participantTokenKey(code: string) {
  return `jukebox:participant:${normalizeRoomCode(code)}`
}

export function isInvalidRoomCredential(
  error: unknown,
  credential: 'host' | 'participant',
) {
  if (!error || typeof error !== 'object') return false
  if (!('status' in error) || !('code' in error)) return false
  return (
    error.status === 401 &&
    error.code ===
      (credential === 'host' ? 'ROOM_SESSION_INVALID' : 'PARTICIPANT_REQUIRED')
  )
}

export function clearStoredRoomCredentials(code: string) {
  localStorage.removeItem(hostTokenKey(code))
  localStorage.removeItem(participantTokenKey(code))
}

export function clearAllStoredRoomCredentials() {
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index)
    if (key?.startsWith('jukebox:host:') || key?.startsWith('jukebox:participant:')) {
      localStorage.removeItem(key)
    }
  }
}
