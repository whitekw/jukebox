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
        panelStyles({ padding: 'responsive' }),
        'flex min-h-0 flex-col md:p-7 lg:overflow-y-auto lg:overscroll-contain lg:px-4 lg:py-5 lg:[scrollbar-width:none] lg:[&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      <div className="mb-3 flex items-center gap-2 border-b border-line px-1 pb-3">
        <h2 className="m-0 text-base font-bold text-ink">{t('queue.title')}</h2>
        <span className="font-mono text-xs text-muted">
          · {t('queue.countShort', { count: songs.length })}
        </span>
        {onRequestSong && (
          <button
            className={cn(
              buttonStyles({ intent: 'outline', size: 'sm' }),
              'ml-auto shrink-0 gap-2 rounded-md border-purple/25 bg-purple/[0.08] px-3 text-[13px] font-semibold text-purple-light hover:border-purple/50 hover:bg-purple/15',
            )}
            type="button"
            aria-haspopup="dialog"
            onClick={onRequestSong}
          >
            <Plus size={15} strokeWidth={2} aria-hidden="true" />{t('search.requestSong')}
          </button>
        )}
      </div>
      <div className="flex flex-1 flex-col">
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
