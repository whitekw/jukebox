import type { ControlCredentials } from './api'
import type { Participant, RoomState } from './types'

export function getRoomPermissions({
  room,
  participant,
  hostToken,
  participantToken,
  isOwner,
}: {
  room: RoomState | null
  participant: Participant | null
  hostToken: string
  participantToken: string
  isOwner: boolean
}) {
  const isManager = Boolean(
    participant &&
      room?.participants.find((member) => member.id === participant.id)?.isManager,
  )
  const controlCredentials: ControlCredentials | null = hostToken
    ? { hostToken, ...(participantToken ? { participantToken } : {}) }
    : isOwner
      ? participantToken
        ? { participantToken }
        : {}
      : isManager && participantToken
        ? { participantToken }
        : null
  const songActionCredentials: ControlCredentials | null = hostToken
    ? { hostToken, ...(participantToken ? { participantToken } : {}) }
    : participantToken
      ? { participantToken }
      : null

  return {
    isManager,
    isController: controlCredentials !== null,
    controlCredentials,
    songActionCredentials,
  }
}
