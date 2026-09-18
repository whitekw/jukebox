import { formatDuration } from '../../format'
import { useI18n } from '../../i18n-context'
import { cn } from '../../styles'
import type { VideoSearchResult } from '../../types'

type VideoResultListProps = {
  videos: VideoSearchResult[]
  addingId: string
  onAddSong: (videoId: string) => void
}

export function VideoResultList({
  videos,
  addingId,
  onAddSong,
}: VideoResultListProps) {
  const { t } = useI18n()

  return (
    <ol className="mt-[18px] flex min-w-0 list-none flex-col gap-1.5 p-0">
      {videos.map((video) => (
        <li
          className={cn(
            'grid min-w-0 grid-cols-[minmax(0,1fr)_36px] gap-x-3 gap-y-2 overflow-hidden',
            'rounded-[10px] bg-white/[0.035] p-3',
            'md:flex md:items-center md:gap-[11px] md:p-2',
          )}
          key={video.videoId}
        >
          <div className="relative col-start-1 row-start-1 aspect-video w-24 shrink-0 md:w-[76px]">
            <img
              className="size-full rounded-[7px] object-cover"
              src={video.thumbnailUrl}
              alt=""
            />
          </div>
          <div className="col-span-2 row-start-2 flex min-w-0 flex-1 flex-col md:col-span-1 md:row-auto">
            <strong
              className="line-clamp-2 max-w-full text-[13px] leading-[1.45] md:block md:overflow-hidden md:text-ellipsis md:whitespace-nowrap"
              title={video.title}
            >
              {video.title}
            </strong>
            <span
              className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-muted"
              title={video.artist}
            >
              {video.artist}
            </span>
            {!video.embeddable && (
              <span className="mt-1 w-fit rounded border border-danger/30 bg-danger/[0.08] px-1.5 py-0.5 text-[10px] font-bold text-[#ff9cab]">
                {t('search.embedUnavailable')}
              </span>
            )}
          </div>
          <span className="hidden font-mono text-[10px] text-dim md:inline">
            {formatDuration(video.durationSeconds)}
          </span>
          <button
            className="col-start-2 row-start-1 grid size-9 shrink-0 place-items-center justify-self-end rounded-[9px] border border-lime/25 bg-lime/[0.05] text-[22px] text-lime disabled:cursor-not-allowed disabled:opacity-45 md:col-auto md:row-auto"
            type="button"
            aria-label={
              video.embeddable
                ? t('search.addSong', { title: video.title })
                : t('search.cannotAddSong', { title: video.title })
            }
            title={!video.embeddable ? t('search.embedUnavailable') : undefined}
            disabled={!video.embeddable || Boolean(addingId)}
            onClick={() => onAddSong(video.videoId)}
          >
            {addingId === video.videoId ? '…' : '+'}
          </button>
        </li>
      ))}
    </ol>
  )
}
