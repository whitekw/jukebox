import { formatDuration } from '../../../shared/format'
import { useI18n } from '../../../shared/i18n/i18n-context'
import { cn } from '../../../shared/styles'
import { PlaylistSaveIcon } from '../../library/PlaylistSaveIcon'
import type { VideoSearchResult } from '../types'
import { AddToQueueButton } from './AddToQueueButton'

type VideoResultListProps = {
  videos: VideoSearchResult[]
  addingId: string
  queuedVideoIds: ReadonlySet<string>
  currentVideoId: string | null
  onAddSong?: (videoId: string) => void
  onManageSaved?: (videoId: string) => void
}

export function VideoResultList({
  videos,
  addingId,
  queuedVideoIds,
  currentVideoId,
  onAddSong,
  onManageSaved,
}: VideoResultListProps) {
  const { t } = useI18n()
  const actionCount = Number(Boolean(onAddSong)) + Number(Boolean(onManageSaved))

  return (
    <ol className="mt-[18px] flex min-w-0 list-none flex-col gap-1.5 p-0">
      {videos.map((video) => (
        <li
          className={cn(
            'grid min-w-0 gap-x-3 gap-y-2 overflow-hidden',
            actionCount === 2 ? 'grid-cols-[minmax(0,1fr)_36px_36px]' :
              actionCount === 1 ? 'grid-cols-[minmax(0,1fr)_36px]' : 'grid-cols-1',
            'group rounded-[4px] bg-white/[0.035] p-3 ring-1 ring-transparent ring-inset transition-colors duration-150 hover:bg-purple/15 hover:ring-purple/40 focus-within:bg-purple/15 focus-within:ring-purple/40',
            'md:flex md:items-center md:gap-[11px] md:p-2',
          )}
          key={video.videoId}
        >
          <div className="relative col-start-1 row-start-1 aspect-video w-24 shrink-0 md:w-[76px]">
            <img
              className="size-full rounded-[4px] object-cover"
              src={video.thumbnailUrl}
              alt=""
            />
          </div>
          <div className={cn('row-start-2 flex min-w-0 flex-1 flex-col md:col-span-1 md:row-auto', actionCount === 2 ? 'col-span-3' : actionCount === 1 && 'col-span-2')}>
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
          {onManageSaved && <button
            className={cn(
              'col-start-2 row-start-1 grid size-9 shrink-0 place-items-center justify-self-end rounded-lg border border-transparent bg-transparent text-muted transition-colors duration-150',
              'hover:bg-white/10 hover:text-purple-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-light md:col-auto md:row-auto',
            )}
            type="button"
            aria-label={`${video.title} · ${t('library.savedInPlaylist')}`}
            title={t('library.savedInPlaylist')}
            onClick={() => onManageSaved(video.videoId)}
          >
            <PlaylistSaveIcon saved />
          </button>}
          {onAddSong && <AddToQueueButton
            className={cn('row-start-1 justify-self-end md:col-auto md:row-auto', onManageSaved ? 'col-start-3' : 'col-start-2')}
            videoId={video.videoId} videoTitle={video.title}
            queuedVideoIds={queuedVideoIds} currentVideoId={currentVideoId}
            unavailable={!video.embeddable}
            loading={addingId === video.videoId}
            disabled={Boolean(addingId)}
            onClick={() => onAddSong(video.videoId)} />}
        </li>
      ))}
    </ol>
  )
}
