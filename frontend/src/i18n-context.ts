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
  CONTROL_FORBIDDEN: 'errors.CONTROL_FORBIDDEN',
  INVALID_MAX_SONGS: 'errors.INVALID_MAX_SONGS',
  INVALID_NICKNAME: 'errors.INVALID_NICKNAME',
  SONG_LIMIT_REACHED: 'errors.SONG_LIMIT_REACHED',
  DUPLICATE_SONG: 'errors.DUPLICATE_SONG',
  INVALID_PLAYBACK_STATE: 'errors.INVALID_PLAYBACK_STATE',
  NO_CURRENT_SONG: 'errors.NO_CURRENT_SONG',
  INVALID_PLAYBACK_BLOCKED_STATE: 'errors.INVALID_PLAYBACK_BLOCKED_STATE',
  SONG_NOT_FOUND: 'errors.SONG_NOT_FOUND',
  INVALID_DIRECTION: 'errors.INVALID_DIRECTION',
  EMPTY_SETTINGS: 'errors.EMPTY_SETTINGS',
  INVALID_HOST_VOLUME: 'errors.INVALID_HOST_VOLUME',
  PARTICIPANT_NOT_FOUND: 'errors.PARTICIPANT_NOT_FOUND',
  ALREADY_MANAGER: 'errors.ALREADY_MANAGER',
  YOUTUBE_NOT_CONFIGURED: 'errors.YOUTUBE_NOT_CONFIGURED',
  YOUTUBE_UNAVAILABLE: 'errors.YOUTUBE_UNAVAILABLE',
  YOUTUBE_API_ERROR: 'errors.YOUTUBE_API_ERROR',
  INVALID_VIDEO: 'errors.INVALID_VIDEO',
  VIDEO_NOT_PLAYABLE: 'errors.VIDEO_NOT_PLAYABLE',
  INVALID_QUERY: 'errors.INVALID_QUERY',
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
