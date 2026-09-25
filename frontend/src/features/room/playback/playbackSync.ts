export type PlaybackSynchronization = {
  positionSeconds: number
  anchorAt: number
  revision: number
  serverTimeOffsetMs: number
  pending: boolean
}

export function expectedPlaybackPosition(
  synchronization: PlaybackSynchronization | undefined,
  paused: boolean,
  now: number,
) {
  if (!synchronization || synchronization.pending) {
    return synchronization?.positionSeconds ?? 0
  }
  const serverNow = now + synchronization.serverTimeOffsetMs
  const elapsed = paused
    ? 0
    : Math.max(0, serverNow - synchronization.anchorAt) / 1000
  return Math.max(0, synchronization.positionSeconds + elapsed)
}
