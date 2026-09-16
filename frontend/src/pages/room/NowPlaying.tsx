import type { ReactNode } from 'react'
import type { Song } from '../../types'
import { useI18n } from '../../i18n-context'
import { panelStyles } from '../../styles'

export const NowPlaying = ({
  song,
  paused,
  blocked,
  player,
  synchronized = false,
}: {
  song: Song | null
  paused: boolean
  blocked: boolean
  player?: ReactNode
  synchronized?: boolean
}) => {
  const { t } = useI18n()

  return (
    <div className={panelStyles({ tone: 'purple', padding: 'responsive' })}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[10px] font-black tracking-[0.16em] text-purple-light">
          <i className="block size-1.5 rounded-full bg-purple-light shadow-[0_0_10px_#9b7bff]" />
          {blocked && song
            ? t('status.autoplayBlocked')
            : paused && song
              ? t('status.paused')
              : t('status.nowPlaying')}
        </span>
        {synchronized && (
          <span className="rounded-full border border-lime/20 bg-lime/[0.05] px-2.5 py-1 text-[10px] font-bold text-lime">
            {t('player.allDevices')}
          </span>
        )}
      </div>
      {song ? (
        <>
          {player && (
            <div className="relative mt-4 aspect-video overflow-hidden rounded-xl bg-[#050507]">
              {player}
            </div>
          )}
          <div className="mt-[13px] flex items-center gap-3 md:gap-4">
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
        </>
      ) : (
        <div className="grid min-h-28 place-items-center rounded-[11px] border border-dashed border-line p-5 text-center text-dim">
          {t('nowPlaying.empty')}
        </div>
      )}
    </div>
  )
}
