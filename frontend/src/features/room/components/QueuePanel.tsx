import { useState } from 'react'
import { SongList } from './SongList'
import { Plus, RefreshCw } from 'lucide-react'
import { useI18n } from '../../../shared/i18n/i18n-context'
import { cn, panelStyles } from '../../../shared/styles'
import type { AutoplaySuggestion, Song } from '../types'

type QueuePanelProps = {
  songs: Song[]
  autoplaySuggestions: AutoplaySuggestion[]
  historyAutoplay: boolean
  className?: string
  onReorder?: (songId: string, targetIndex: number) => void
  onRemove?: (songId: string) => void
  canRemove?: (song: Song) => boolean
  onRequestSong?: () => void
  onRefreshAutoplay?: () => Promise<void>
  onLibraryChange: () => void
  libraryRevision: number
}

export function QueuePanel({
  songs,
  autoplaySuggestions,
  historyAutoplay,
  className,
  onReorder,
  onRemove,
  canRemove,
  onRequestSong,
  onRefreshAutoplay,
  onLibraryChange,
  libraryRevision,
}: QueuePanelProps) {
  const { t } = useI18n()
  const [refreshingAutoplay, setRefreshingAutoplay] = useState(false)

  async function refreshAutoplay() {
    if (!onRefreshAutoplay || refreshingAutoplay) return
    setRefreshingAutoplay(true)
    try {
      await onRefreshAutoplay()
    } finally {
      setRefreshingAutoplay(false)
    }
  }

  return (
    <section
      className={cn(
        panelStyles({ padding: 'none' }),
        'flex min-h-0 flex-col p-4 sm:overflow-hidden sm:px-0 sm:py-3 room:overflow-y-auto room:overscroll-contain room:px-4 room:py-5 room:[scrollbar-width:none] room:[&::-webkit-scrollbar]:hidden',
        className,
      )}
      aria-label={t('queue.title')}
    >
      <div className="mb-3 flex shrink-0 items-center gap-2 px-1 sm:max-room:justify-center sm:max-room:px-2">
        <h2 className="m-0 text-xs font-semibold text-muted sm:max-room:sr-only">
          {t('queue.title')} <span className="font-mono font-normal">· {t('queue.countShort', { count: songs.length })}</span>
        </h2>
        {onRequestSong && (
          <button
            className={cn(
              'ml-auto flex h-7 shrink-0 items-center gap-1.5 rounded-[4px] px-1 text-xs font-bold text-purple-light transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-purple-light',
              'sm:max-room:ml-0 sm:max-room:size-11 sm:max-room:justify-center sm:max-room:p-0',
            )}
            type="button"
            aria-haspopup="dialog"
            aria-label={t('search.requestSong')}
            title={t('search.requestSong')}
            onClick={onRequestSong}
          >
            <Plus size={15} strokeWidth={2} aria-hidden="true" className="sm:max-room:size-[21px]" />
            <span className="sm:max-room:sr-only">{t('search.requestSong')}</span>
          </button>
        )}
      </div>
      <div className="flex flex-1 flex-col sm:max-room:min-h-0 sm:max-room:overflow-y-auto sm:max-room:overscroll-contain sm:max-room:px-2 sm:max-room:[scrollbar-width:none] sm:max-room:[&::-webkit-scrollbar]:hidden">
        {(!historyAutoplay || songs.length > 0) && <>
            <SongList
              songs={songs}
              emptyMessage={t('host.emptyQueue')}
              emptyDescription={t('queue.emptyDescription')}
              onReorder={onReorder}
              onRemove={onRemove}
              canRemove={canRemove}
              onLibraryChange={onLibraryChange}
              libraryRevision={libraryRevision}
            />
          </>}
        {historyAutoplay && <div className={songs.length > 0 ? 'mt-5 border-t border-line pt-4 sm:max-room:mt-2 sm:max-room:pt-2' : ''}>
          <div className="mb-3 flex items-center justify-between gap-2 px-1 sm:max-room:justify-center">
            <h3 className="text-xs font-semibold text-muted sm:max-room:sr-only">{t('queue.autoplayNext')}</h3>
            {onRefreshAutoplay && <button type="button" onClick={() => { void refreshAutoplay() }}
              disabled={refreshingAutoplay} aria-label={t('queue.refreshAutoplay')}
              title={t('queue.refreshAutoplay')}
              className="grid size-7 shrink-0 place-items-center rounded-[4px] text-muted transition-colors hover:bg-white/[0.07] hover:text-purple-light focus-visible:outline-2 focus-visible:outline-purple-light disabled:opacity-50 sm:max-room:size-11">
              <RefreshCw size={15} className={refreshingAutoplay ? 'animate-spin' : ''} aria-hidden="true" />
            </button>}
          </div>
          {autoplaySuggestions.length === 0 && <p className="px-1 text-xs leading-5 text-muted sm:max-room:sr-only">{t('queue.autoplayUnavailable')}</p>}
          <ol className="m-0 flex list-none flex-col gap-[7px] p-0 sm:max-room:items-center sm:max-room:gap-2">
            {autoplaySuggestions.map((song) => <li key={song.id}
              title={`${song.title} · ${song.artist}`}
              className="flex min-h-[68px] items-center gap-[11px] rounded-[4px] border border-transparent bg-white/[0.035] p-2 sm:max-room:size-11 sm:max-room:min-h-0 sm:max-room:shrink-0 sm:max-room:gap-0 sm:max-room:border-0 sm:max-room:p-0">
              <img src={song.thumbnailUrl} alt="" loading="lazy"
                className="size-14 shrink-0 rounded-[4px] bg-[#17151c] object-cover sm:max-room:size-11" />
              <div className="flex min-w-0 flex-col sm:max-room:sr-only">
                <strong className="truncate text-[13px]">{song.title}</strong>
                <span className="truncate text-[11px] text-muted">{song.artist}</span>
              </div>
            </li>)}
          </ol>
        </div>}
      </div>
    </section>
  )
}
