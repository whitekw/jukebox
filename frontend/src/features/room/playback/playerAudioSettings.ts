const PLAYER_AUDIO_SETTINGS_STORAGE_KEY = 'jukebox:player-audio-settings'

export type PlayerAudioSettings = {
  volume: number
  muted: boolean
}

export function clampVolume(volume: number) {
  return Math.min(100, Math.max(0, Math.round(volume)))
}

export function readPlayerAudioSettings(fallbackVolume: number): PlayerAudioSettings {
  const fallback = {
    volume: clampVolume(fallbackVolume),
    muted: false,
  }

  try {
    const storedValue = window.localStorage.getItem(
      PLAYER_AUDIO_SETTINGS_STORAGE_KEY,
    )
    if (!storedValue) return fallback

    const parsed = JSON.parse(storedValue) as Partial<PlayerAudioSettings>
    if (
      !Number.isFinite(parsed.volume) ||
      typeof parsed.muted !== 'boolean'
    ) {
      return fallback
    }

    return {
      volume: clampVolume(parsed.volume as number),
      muted: parsed.muted,
    }
  } catch {
    return fallback
  }
}

export function writePlayerAudioSettings(settings: PlayerAudioSettings) {
  try {
    window.localStorage.setItem(
      PLAYER_AUDIO_SETTINGS_STORAGE_KEY,
      JSON.stringify(settings),
    )
  } catch {
    // 저장 공간이 차단된 브라우저에서도 재생 자체는 계속 동작해야 한다.
  }
}
