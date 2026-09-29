import type { ReactNode } from 'react'
import { Music2 as MusicIcon, Play as PlayIcon, Plus } from 'lucide-react'
import type { Song } from '../types'
import { useI18n } from '../../../shared/i18n/i18n-context'
import { buttonStyles, cn, vinylStyles } from '../../../shared/styles'

export const NowPlaying = ({
  song,
  player,
  onClaimPlaybackHost,
  claimingPlaybackHost = false,
  onRequestSong,
}: {
  song: Song | null
  player?: ReactNode
  onClaimPlaybackHost?: () => void
  claimingPlaybackHost?: boolean
  onRequestSong?: () => void
}) => {
  const { t } = useI18n()
  return (
    <div className="flex w-full flex-col items-center">
      {song ? (
        <div className="flex w-full flex-col items-center gap-5">
          <div className="flex w-full max-w-[min(960px,calc(max(180px,100dvh-360px)*16/9))] min-w-0 items-center justify-center">
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
          <div className="flex w-full max-w-[800px] min-w-0 flex-col items-center justify-center gap-3 text-center">
            <div className="w-full min-w-0">
              <h2 className="m-0 line-clamp-3 break-words text-xl font-bold leading-snug text-ink md:text-2xl" title={song.title}>
                {song.title}
              </h2>
              <p className="m-0 mt-2 truncate text-sm text-muted md:text-base" title={song.artist}>
                {song.artist}
              </p>
            </div>
            <div className="flex max-w-full min-w-0 items-center gap-2 text-sm text-muted">
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
            {onRequestSong && (
              <button
                className={cn(
                  buttonStyles({ intent: 'outline', size: 'sm' }),
                  'gap-2 rounded-md border-purple/25 bg-purple/[0.08] text-[13px] font-semibold text-purple-light hover:border-purple/50 hover:bg-purple/15 room:hidden',
                )}
                type="button"
                aria-haspopup="dialog"
                onClick={onRequestSong}
              >
                <Plus size={16} aria-hidden="true" />{t('search.requestSong')}
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
            {onRequestSong && (
              <button
                className={cn(
                  buttonStyles({ intent: 'outline', size: 'md' }),
                  'mt-6 gap-2 rounded-md border-purple/25 bg-purple/[0.08] font-semibold text-purple-light hover:border-purple/50 hover:bg-purple/15',
                )}
                type="button"
                aria-haspopup="dialog"
                onClick={onRequestSong}
              >
                <Plus size={18} aria-hidden="true" />{t('search.requestFirstSong')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
