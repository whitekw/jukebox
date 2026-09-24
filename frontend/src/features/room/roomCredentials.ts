export function normalizeRoomCode(code: string | undefined) {
  return String(code ?? '').trim().toUpperCase()
}

export function hostTokenKey(code: string) {
  return `jukebox:host:${normalizeRoomCode(code)}`
}

export function participantTokenKey(code: string) {
  return `jukebox:participant:${normalizeRoomCode(code)}`
}

export type StoredRoomCredentials = {
  code: string
  hostToken?: string
  participantToken?: string
}

export function getStoredRoomCredentials(): StoredRoomCredentials[] {
  const credentialsByCode = new Map<string, StoredRoomCredentials>()
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (!key) continue
    const [prefix, credentialType, rawCode] = key.split(':')
    if (
      prefix !== 'jukebox' ||
      !['host', 'participant'].includes(credentialType) ||
      !rawCode
    ) {
      continue
    }
    const code = normalizeRoomCode(rawCode)
    if (!/^[A-Z0-9]{6}$/.test(code)) continue
    const token = localStorage.getItem(key)
    if (!token) continue
    const credentials = credentialsByCode.get(code) ?? { code }
    if (credentialType === 'host') credentials.hostToken = token
    if (credentialType === 'participant') credentials.participantToken = token
    credentialsByCode.set(code, credentials)
  }
  return [...credentialsByCode.values()]
}

export function clearStoredRoomCredentials(code: string) {
  localStorage.removeItem(hostTokenKey(code))
  localStorage.removeItem(participantTokenKey(code))
}
