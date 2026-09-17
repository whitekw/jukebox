import type { ReactNode } from 'react'
import type { Song } from '../../types'
import { MusicIcon, SkipIcon } from '../../components/Icons'
import { useI18n } from '../../i18n-context'
import { buttonStyles, cn, panelStyles, vinylStyles } from '../../styles'

export const NowPlaying = ({
  song,
  paused,
  blocked,
  player,
  onAdvance,
}: {
  song: Song | null
  paused: boolean
  blocked: boolean
  player?: ReactNode
  onAdvance?: () => void
}) => {
  const { t } = useI18n()

  return (
    <div
      className={cn(
        panelStyles({ tone: 'purple', padding: 'responsive' }),
        'flex h-full min-h-0 flex-col',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[10px] font-black tracking-[0.16em] text-purple-light">
          <i
            className={cn(
              'block size-1.5 rounded-full',
              song
                ? 'bg-purple-light shadow-[0_0_10px_#9b7bff]'
                : 'bg-purple/60',
            )}
          />
          {!song
            ? t('status.waiting')
            : blocked
              ? t('status.autoplayBlocked')
              : paused
                ? t('status.paused')
                : t('status.nowPlaying')}
        </span>
      </div>
      {song ? (
        <>
          {player && (
            <div className="relative mt-4 aspect-video overflow-hidden rounded-xl bg-[#050507]">
              {player}
            </div>
          )}
          <div className="mt-[13px] flex items-end justify-between gap-3 md:gap-4">
            <div className="flex min-w-0 items-center gap-3 md:gap-4">
              {!player && (
                <img
                  className="aspect-video w-[108px] shrink-0 rounded-[10px] object-cover md:w-[142px]"
                  src={song.thumbnailUrl}
                  alt=""
                />
              )}
              <div className="min-w-0">
                <h1 className="mb-[5px] overflow-hidden text-ellipsis whitespace-nowrap text-[17px] md:text-[22px]">
                  {song.title}
                </h1>
                <p className="m-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm text-muted md:text-base">
                  {song.artist}
                </p>
                <small className="text-dim">
                  {t('song.requestedBy', { nickname: song.addedBy })}
                </small>
              </div>
            </div>
            {onAdvance && (
              <button
                className={cn(
                  buttonStyles({ intent: 'outline', size: 'md' }),
                  'size-11 shrink-0 px-0 font-bold sm:h-11 sm:w-auto sm:px-4',
                )}
                type="button"
                onClick={onAdvance}
              >
                <SkipIcon size={18} />
                <span className="sr-only sm:not-sr-only">
                  {t('manager.skip')}
                </span>
              </button>
            )}
          </div>
        </>
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
