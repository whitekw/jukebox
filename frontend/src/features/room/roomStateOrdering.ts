import type { RoomState } from './types'

export function preferCurrentPlaybackRevision(
  current: RoomState | null,
  incoming: RoomState | null,
) {
  if (
    current && incoming &&
    current.code === incoming.code &&
    incoming.playbackRevision < current.playbackRevision
  ) {
    return current
  }
  return incoming
}
