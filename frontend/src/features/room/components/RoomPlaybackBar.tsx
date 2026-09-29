import { useEffect, useState } from 'react'
import { CirclePlus, Music2, Pause, Play, SkipForward, Volume2, VolumeX } from 'lucide-react'
import { useI18n } from '../../../shared/i18n/i18n-context'
import { buttonStyles, cn } from '../../../shared/styles'
import { expectedPlaybackPosition, type PlaybackSynchronization } from '../playback/playbackSync'
import type { PlayerAudioSettings } from '../playback/playerAudioSettings'
import type { Song } from '../types'
import { SaveToPlaylistDialog } from '../../library/SaveToPlaylistDialog'

type RoomPlaybackBarProps = {
  song: Song | null
  paused: boolean
  blocked: boolean
  synchronization: PlaybackSynchronization
  localPositionSeconds?: number
  audioSettings?: PlayerAudioSettings
  onVolumeChange?: (volume: number) => void
  onAdvance?: () => void
  onGlobalPlaybackToggle?: () => void
}

export function RoomPlaybackBar({
  song,
  paused,
  blocked,
  synchronization,
  localPositionSeconds,
  audioSettings,
  onVolumeChange,
  onAdvance,
  onGlobalPlaybackToggle,
}: RoomPlaybackBarProps) {
  const { t } = useI18n()
  const [now, setNow] = useState(() => Date.now())
  const [saveSongId, setSaveSongId] = useState<string | null>(null)
  const songId = song?.id
  useEffect(() => {
    if (!songId) return
    const timer = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [songId])

  const duration = song?.durationSeconds ?? 0
  const position = Math.min(
    duration,
    Math.max(0, localPositionSeconds ?? expectedPlaybackPosition(synchronization, paused || blocked, now)),
  )
  const progress = duration > 0 ? (position / duration) * 100 : 0

  return (
    <footer className="relative z-20 shrink-0 border-t border-line bg-[#110f16]/95 py-2.5">
      {song && duration > 0 && (
        <div
          className="pointer-events-none absolute inset-x-0 -top-px h-1 bg-white/10"
          role="progressbar"
          aria-label={t('playback.progress')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
        >
          <div
            className="h-full bg-purple-light transition-[width] duration-500 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
      <div className="flex h-14 w-full items-center gap-3 px-4 md:gap-5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {song ? (
            <img
              className="size-12 shrink-0 rounded-lg object-cover"
              src={song.thumbnailUrl}
              alt=""
            />
          ) : (
            <div className="grid size-12 shrink-0 place-items-center rounded-lg border border-purple/25 bg-purple/10 text-purple-light">
              <Music2 size={20} />
            </div>
          )}
          <div className="min-w-0 max-w-[min(520px,40vw)]">
            <h1 className="m-0 truncate text-sm font-bold text-ink" title={song?.title}>
              {song?.title ?? t('status.waiting')}
            </h1>
            <p className="m-0 truncate text-xs text-muted">
              {song?.artist ?? t('nowPlaying.empty')}
            </p>
          </div>
          {song && (
            <button
              className="grid size-9 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-white/10 hover:text-purple-light focus-visible:outline-2 focus-visible:outline-purple-light"
              type="button"
              aria-label={t('library.addToPlaylist')}
              title={t('library.addToPlaylist')}
              onClick={() => setSaveSongId(song.id)}
            >
              <CirclePlus size={21} aria-hidden="true" />
            </button>
          )}
        </div>
        {(onGlobalPlaybackToggle || onAdvance) && song && (
          <div className="flex shrink-0 items-center gap-2">
            {onGlobalPlaybackToggle && (
              <button
                className={cn(
                  buttonStyles({ intent: paused ? 'primary' : 'outline', size: 'md' }),
                  'size-10 shrink-0 px-0',
                )}
                type="button"
                aria-label={paused ? t('manager.playAll') : t('manager.pauseAll')}
                title={paused ? t('manager.playAll') : t('manager.pauseAll')}
                onClick={onGlobalPlaybackToggle}
              >
                {paused ? <Play size={17} /> : <Pause size={17} />}
              </button>
            )}
            {onAdvance && (
              <button
                className={cn(
                  buttonStyles({ intent: 'outline', size: 'md' }),
                  'size-10 shrink-0 px-0',
                )}
                type="button"
                aria-label={t('manager.skip')}
                title={t('manager.skip')}
                onClick={onAdvance}
              >
                <SkipForward size={17} />
              </button>
            )}
          </div>
        )}
        {song && audioSettings && onVolumeChange && (
          <div className="flex w-28 shrink-0 items-center gap-2 text-muted max-[420px]:w-20">
            {audioSettings.muted || audioSettings.volume === 0
              ? <VolumeX size={18} aria-hidden="true" className="shrink-0" />
              : <Volume2 size={18} aria-hidden="true" className="shrink-0" />}
            <input
              className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-purple-light [&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-purple-light [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-light"
              type="range"
              min={0}
              max={100}
              step={1}
              value={audioSettings.volume}
              onChange={(event) => onVolumeChange(event.currentTarget.valueAsNumber)}
              aria-label={t('playback.volume')}
              title={`${t('playback.volume')}: ${audioSettings.volume}%`}
              style={{ background: `linear-gradient(to right, var(--color-purple-light) ${audioSettings.volume}%, rgba(255,255,255,.18) ${audioSettings.volume}%)` }}
            />
          </div>
        )}
      </div>
      {song && saveSongId === song.id && <SaveToPlaylistDialog key={song.id} song={song} onClose={() => setSaveSongId(null)} />}
    </footer>
  )
}
