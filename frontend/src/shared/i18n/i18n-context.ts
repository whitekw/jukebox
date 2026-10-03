import { createContext, useContext } from 'react'
import type { TranslationKey } from './messages'

export type Locale = 'ko' | 'ja' | 'en'
export type TranslationValues = Record<string, string | number>
export type Translate = (
  key: TranslationKey,
  values?: TranslationValues,
) => string

export type I18nContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: Translate
}

export const I18nContext = createContext<I18nContextValue | null>(null)

export function useI18n() {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n must be used inside I18nProvider')
  return value
}

const errorMessageKeys: Partial<Record<string, TranslationKey>> = {
  INVALID_JSON: 'errors.INVALID_JSON',
  INTERNAL_ERROR: 'errors.INTERNAL_ERROR',
  RATE_LIMITED: 'errors.RATE_LIMITED',
  ROOM_NOT_FOUND: 'errors.ROOM_NOT_FOUND',
  PARTICIPANT_REQUIRED: 'errors.PARTICIPANT_REQUIRED',
  MANAGER_FORBIDDEN: 'errors.MANAGER_FORBIDDEN',
  HOST_FORBIDDEN: 'errors.HOST_FORBIDDEN',
  HOST_ONLY_REQUIRED: 'errors.HOST_ONLY_REQUIRED',
  CONTROL_FORBIDDEN: 'errors.CONTROL_FORBIDDEN',
  OWNER_FORBIDDEN: 'errors.OWNER_FORBIDDEN',
  OWNER_MODERATION_FORBIDDEN: 'errors.OWNER_MODERATION_FORBIDDEN',
  PARTICIPANT_OFFLINE: 'errors.PARTICIPANT_OFFLINE',
  SONG_CONTROL_FORBIDDEN: 'errors.SONG_CONTROL_FORBIDDEN',
  INVALID_PLAYBACK_MODE: 'errors.INVALID_PLAYBACK_MODE',
  AUTH_REQUIRED: 'errors.AUTH_REQUIRED',
  INVALID_NICKNAME: 'errors.INVALID_NICKNAME',
  DUPLICATE_SONG: 'errors.DUPLICATE_SONG',
  INVALID_PLAYBACK_STATE: 'errors.INVALID_PLAYBACK_STATE',
  NO_CURRENT_SONG: 'errors.NO_CURRENT_SONG',
  SONG_NOT_CURRENT: 'errors.SONG_NOT_CURRENT',
  SELF_VOTE_FORBIDDEN: 'errors.SELF_VOTE_FORBIDDEN',
  INVALID_TIME_ZONE: 'errors.INVALID_TIME_ZONE',
  INVALID_SONG_VOTE: 'errors.INVALID_SONG_VOTE',
  INVALID_PLAYBACK_BLOCKED_STATE: 'errors.INVALID_PLAYBACK_BLOCKED_STATE',
  SONG_NOT_FOUND: 'errors.SONG_NOT_FOUND',
  INVALID_QUEUE_POSITION: 'errors.INVALID_QUEUE_POSITION',
  EMPTY_SETTINGS: 'errors.EMPTY_SETTINGS',
  INVALID_HISTORY_AUTOPLAY: 'errors.INVALID_HISTORY_AUTOPLAY',
  INVALID_HISTORY_REQUESTER: 'errors.INVALID_HISTORY_REQUESTER',
  INVALID_AUTOPLAY_FILTERS: 'errors.INVALID_AUTOPLAY_FILTERS',
  INVALID_AUTOPLAY_DURATION: 'errors.INVALID_AUTOPLAY_DURATION',
  INVALID_AUTOPLAY_SEARCH: 'errors.INVALID_AUTOPLAY_SEARCH',
  AUTOPLAY_HISTORY_REQUIRED: 'errors.AUTOPLAY_HISTORY_REQUIRED',
  HISTORY_AUTOPLAY_DISABLED: 'errors.HISTORY_AUTOPLAY_DISABLED',
  INVALID_HOST_VOLUME: 'errors.INVALID_HOST_VOLUME',
  PARTICIPANT_NOT_FOUND: 'errors.PARTICIPANT_NOT_FOUND',
  INVALID_MANAGER_STATE: 'errors.INVALID_MANAGER_STATE',
  MANAGER_ACCOUNT_REQUIRED: 'errors.MANAGER_ACCOUNT_REQUIRED',
  YOUTUBE_NOT_CONFIGURED: 'errors.YOUTUBE_NOT_CONFIGURED',
  YOUTUBE_UNAVAILABLE: 'errors.YOUTUBE_UNAVAILABLE',
  YOUTUBE_API_ERROR: 'errors.YOUTUBE_API_ERROR',
  INVALID_VIDEO: 'errors.INVALID_VIDEO',
  VIDEO_NOT_PLAYABLE: 'errors.VIDEO_NOT_PLAYABLE',
  INVALID_QUERY: 'errors.INVALID_QUERY',
  INVALID_CHAT_MESSAGE: 'errors.INVALID_CHAT_MESSAGE',
  INVALID_PLAYLIST_NAME: 'errors.INVALID_PLAYLIST_NAME',
  INVALID_PLAYLIST_POSITION: 'errors.INVALID_PLAYLIST_POSITION',
  PLAYLIST_NOT_FOUND: 'errors.PLAYLIST_NOT_FOUND',
  PLAYLIST_IMMUTABLE: 'errors.PLAYLIST_IMMUTABLE',
  INVALID_LIBRARY_SONG: 'errors.INVALID_LIBRARY_SONG',
}

export function getErrorMessage(error: unknown, t: Translate) {
  if (error && typeof error === 'object') {
    const code = 'code' in error ? String(error.code ?? '') : ''
    const details =
      'details' in error && error.details && typeof error.details === 'object'
        ? (error.details as TranslationValues)
        : undefined
    const key = errorMessageKeys[code]
    if (key) return t(key, details)
  }
  if (error instanceof TypeError) return t('errors.network')
  return t('errors.generic')
}
