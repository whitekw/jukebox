import { SongList } from './SongList'
import { Plus } from 'lucide-react'
import { useI18n } from '../../../shared/i18n/i18n-context'
import { buttonStyles, cn, panelStyles } from '../../../shared/styles'
import type { Song } from '../types'

type QueuePanelProps = {
  songs: Song[]
  className?: string
  onReorder?: (songId: string, targetIndex: number) => void
  onRemove?: (songId: string) => void
  canRemove?: (song: Song) => boolean
  onRequestSong?: () => void
  onLibraryChange: () => void
  libraryRevision: number
}

export function QueuePanel({
  songs,
  className,
  onReorder,
  onRemove,
  canRemove,
  onRequestSong,
  onLibraryChange,
  libraryRevision,
}: QueuePanelProps) {
  const { t } = useI18n()

  return (
    <section
      className={cn(
        panelStyles({ padding: 'none' }),
        'flex min-h-0 flex-col p-4 sm:overflow-hidden sm:px-0 sm:py-3 room:overflow-y-auto room:overscroll-contain room:px-4 room:py-5 room:[scrollbar-width:none] room:[&::-webkit-scrollbar]:hidden',
        className,
      )}
      aria-label={t('queue.title')}
    >
      <div className="mb-3 flex shrink-0 items-center gap-2 border-b border-line px-1 pb-3 sm:max-room:justify-center sm:max-room:border-0 sm:max-room:px-2 sm:max-room:pb-0">
        <h2 className="m-0 text-base font-bold text-ink sm:max-room:sr-only">{t('queue.title')}</h2>
        <span className="font-mono text-xs text-muted sm:max-room:sr-only">
          · {t('queue.countShort', { count: songs.length })}
        </span>
        {onRequestSong && (
          <button
            className={cn(
              buttonStyles({ intent: 'outline', size: 'sm' }),
              'ml-auto shrink-0 gap-2 rounded-md border-purple/25 bg-purple/[0.08] px-3 text-[13px] font-semibold text-purple-light hover:border-purple/50 hover:bg-purple/15',
              'sm:max-room:ml-0 sm:max-room:size-11 sm:max-room:gap-0 sm:max-room:rounded-[4px] sm:max-room:border-purple-light/25 sm:max-room:bg-purple-light/10 sm:max-room:p-0 sm:max-room:hover:border-purple-light/50 sm:max-room:hover:bg-purple/25',
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
      </div>
    </section>
  )
}
