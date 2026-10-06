import type { ControlCredentials } from './api'
import type { Participant, RoomState, Song } from './types'

export function canControlSong(
  song: Pick<Song, 'addedById' | 'otherControlAvailableAt'>,
  participantId: string | undefined,
  isController: boolean,
  serverNow: number,
) {
  return isController || Boolean(
    participantId && (
      song.addedById === participantId ||
      (song.otherControlAvailableAt !== null &&
        serverNow >= song.otherControlAvailableAt)
    ),
  )
}

export function canReportPlaybackFailure(
  room: Pick<RoomState, 'playbackMode' | 'currentSong'>,
  participantId: string | undefined,
  isController: boolean,
  isHost: boolean,
  serverNow: number,
) {
  if (!room.currentSong) return false
  return room.playbackMode === 'host_only'
    ? isHost
    : canControlSong(room.currentSong, participantId, isController, serverNow)
}

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
