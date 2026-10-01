import type { RoomHistoryEntry } from '../types'

export function mergeRoomHistory(current: RoomHistoryEntry[], recent: RoomHistoryEntry[]) {
  const recentIds = new Set(recent.map(({ id }) => id))
  return [...recent, ...current.filter(({ id }) => !recentIds.has(id))]
}
