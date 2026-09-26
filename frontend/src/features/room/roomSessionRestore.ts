import type { Participant, RoomState } from './types'

type JoinedRoom = {
  participantToken: string
  participant: Participant
  room: RoomState
}

type RoomSessionApi = {
  resumeRoom: (code: string) => Promise<JoinedRoom>
  getMe: (code: string, participantToken: string) => Promise<Participant>
  joinRoom: (code: string, nickname: string, participantToken?: string) => Promise<JoinedRoom>
}

export async function restoreAccountRoomSession(
  code: string,
  displayName: string,
  storedToken: string | null,
  api: RoomSessionApi,
  isCurrent: () => boolean,
): Promise<JoinedRoom | null> {
  try {
    return await api.resumeRoom(code)
  } catch (error) {
    if (!error || typeof error !== 'object' || !('code' in error)
      || error.code !== 'MEMBERSHIP_NOT_FOUND') {
      throw error
    }
  }

  if (!storedToken || !isCurrent()) return null

  // Only convert a guest who actually joined this room. A stale token must not
  // silently create an account membership.
  await api.getMe(code, storedToken)
  if (!isCurrent()) return null
  return api.joinRoom(code, displayName.slice(0, 20), storedToken)
}
