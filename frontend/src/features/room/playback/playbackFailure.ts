export type PlaybackFailureReport = {
  errorCode: number | null
  pending: boolean
  reported: boolean
}

export function createPlaybackFailureReport(): PlaybackFailureReport {
  return { errorCode: null, pending: false, reported: false }
}

export async function retryPlaybackFailureReport(
  failure: PlaybackFailureReport,
  isCurrent: () => boolean,
  report: (errorCode: number) => Promise<boolean>,
) {
  if (failure.errorCode === null || failure.pending || failure.reported || !isCurrent()) return
  failure.pending = true
  try {
    failure.reported = await report(failure.errorCode)
  } catch {
    // A rejected request must remain eligible for the next synchronization tick.
    failure.reported = false
  } finally {
    failure.pending = false
  }
}
