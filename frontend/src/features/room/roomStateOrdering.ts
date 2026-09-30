import type { RoomState } from './types'

export function preferCurrentPlaybackRevision(
  current: RoomState | null,
  incoming: RoomState | null,
) {
  if (
    current && incoming &&
    current.code === incoming.code &&
    (incoming.playbackRevision < current.playbackRevision || (
      incoming.playbackRevision === current.playbackRevision &&
      current.currentSong?.id === incoming.currentSong?.id &&
      (incoming.currentSong?.voteRevision ?? 0) < (current.currentSong?.voteRevision ?? 0)
    ))
  ) {
    return current
  }
  return incoming
}
