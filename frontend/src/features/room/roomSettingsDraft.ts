import type { RoomState } from './types'

export type RoomSettings = Pick<RoomState, 'title' | 'allowGuests' | 'historyAutoplay' | 'autoplayFilters'>
export type RoomSettingsDraft = Omit<RoomSettings, 'autoplayFilters'> & {
  excludedWords: string[]
  excludedVideoIds: string[]
  wordInput: string
  minMinutes: string
  minSeconds: string
  maxMinutes: string
  maxSeconds: string
}
export type DurationField = 'minMinutes' | 'minSeconds' | 'maxMinutes' | 'maxSeconds'

export function createRoomSettingsDraft(room: RoomSettings): RoomSettingsDraft {
  return {
    title: room.title, allowGuests: room.allowGuests, historyAutoplay: room.historyAutoplay,
    excludedWords: [...room.autoplayFilters.excludedWords],
    excludedVideoIds: [...room.autoplayFilters.excludedVideoIds], wordInput: '',
    minMinutes: String(Math.floor(room.autoplayFilters.minDurationSeconds / 60)),
    minSeconds: String(room.autoplayFilters.minDurationSeconds % 60),
    maxMinutes: String(Math.floor(room.autoplayFilters.maxDurationSeconds / 60)),
    maxSeconds: String(room.autoplayFilters.maxDurationSeconds % 60),
  }
}

export function appendExcludedWord(words: string[], input: string): string[] | null {
  const word = input.trim()
  const normalize = (value: string) => value.normalize('NFKC').toLowerCase()
  if (!word || words.some((item) => normalize(item) === normalize(word))) return words
  if (word.length > 80 || words.length >= 50) return null
  return [...words, word]
}

export function getDurationErrorField(draft: RoomSettingsDraft): DurationField | null {
  for (const field of ['minMinutes', 'minSeconds', 'maxMinutes', 'maxSeconds'] as const) {
    const limit = field.endsWith('Minutes') ? 1440 : 59
    if (!/^\d+$/.test(draft[field]) || Number(draft[field]) > limit) return field
  }
  const minimum = Number(draft.minMinutes) * 60 + Number(draft.minSeconds)
  const maximum = Number(draft.maxMinutes) * 60 + Number(draft.maxSeconds)
  if (minimum > 86400) return 'minMinutes'
  if (maximum < 1 || maximum > 86400 || minimum > maximum) return 'maxMinutes'
  return null
}

export function hasRoomSettingsChanges(draft: RoomSettingsDraft, room: RoomSettings): boolean {
  const saved = createRoomSettingsDraft(room)
  return (Object.keys(saved) as (keyof RoomSettingsDraft)[])
    .some((key) => JSON.stringify(draft[key]) !== JSON.stringify(saved[key]))
}
