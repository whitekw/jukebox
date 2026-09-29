import type { ReactNode } from 'react'
import { Music2 as MusicIcon, Play as PlayIcon } from 'lucide-react'
import type { Song } from '../types'
import { useI18n } from '../../../shared/i18n/i18n-context'
import { buttonStyles, cn, vinylStyles } from '../../../shared/styles'

export const NowPlaying = ({
  song,
  paused,
  blocked,
  player,
  onClaimPlaybackHost,
  claimingPlaybackHost = false,
}: {
  song: Song | null
  paused: boolean
  blocked: boolean
  player?: ReactNode
  onClaimPlaybackHost?: () => void
  claimingPlaybackHost?: boolean
}) => {
  const { t } = useI18n()
  const playbackStatus = blocked
    ? t('status.autoplayBlocked')
    : paused
      ? t('status.paused')
      : t('status.nowPlaying')

  return (
    <div className="flex w-full flex-col overflow-hidden xl:[container-type:inline-size]">
      {song ? (
        <div className="grid gap-5 xl:grid-cols-[min(55cqw,calc(45dvh*16/9))_minmax(0,1fr)] xl:items-center xl:gap-4">
          <div className="flex min-w-0 items-center justify-center">
            {player ? (
              <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-[#050507]">
                {player}
              </div>
            ) : (
              <img
                className="aspect-video w-full rounded-xl object-contain"
                src={song.thumbnailUrl}
                alt=""
              />
            )}
          </div>
          <div className="flex min-w-0 flex-col justify-center gap-3 lg:gap-4">
            <span className="text-xs font-bold text-purple-light">{playbackStatus}</span>
            <div className="min-w-0">
              <h2 className="m-0 line-clamp-3 break-words text-xl font-bold leading-snug text-ink md:text-2xl" title={song.title}>
                {song.title}
              </h2>
              <p className="m-0 mt-2 truncate text-sm text-muted md:text-base" title={song.artist}>
                {song.artist}
              </p>
            </div>
            <div className="flex min-w-0 items-center gap-2 text-sm text-muted">
              <span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-full border border-purple/30 bg-purple/20 text-xs font-bold text-purple-light">
                {song.addedByAvatarUrl ? (
                  <img className="size-full object-cover" src={song.addedByAvatarUrl} alt="" />
                ) : (
                  song.addedBy.trim().slice(0, 1).toUpperCase()
                )}
              </span>
              <span className="truncate" title={t('song.requestedBy', { nickname: song.addedBy })}>
                {t('song.requestedBy', { nickname: song.addedBy })}
              </span>
            </div>
            {!player && onClaimPlaybackHost && (
            <button
              className={cn(
                buttonStyles({ intent: 'primary', size: 'md' }),
                'mt-1 w-full justify-center sm:w-fit',
              )}
              disabled={claimingPlaybackHost}
              type="button"
              onClick={onClaimPlaybackHost}
            >
              <PlayIcon size={17} />
              {claimingPlaybackHost
                ? t('host.claimingPlayback')
                : t('host.claimPlayback')}
            </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex min-h-[190px] flex-1 items-center justify-center px-4 py-8 text-center md:min-h-[220px]">
          <div className="flex max-w-[360px] flex-col items-center">
            <div
              className={cn(
                vinylStyles,
                'mb-5 size-[68px] shadow-[0_0_45px_rgba(155,123,255,.12)] motion-safe:animate-none',
              )}
            >
              <MusicIcon size={27} />
            </div>
            <h2 className="mb-2 text-lg tracking-[-0.03em] text-ink md:text-xl">
              {t('nowPlaying.empty')}
            </h2>
            <p className="m-0 text-xs leading-5 text-dim md:text-[13px]">
              {t('nowPlaying.emptyDescription')}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
