import { SongList } from '../../components/SongList'
import { useI18n } from '../../i18n-context'
import { cn, panelStyles, sectionKickerStyles } from '../../styles'
import type { Song } from '../../types'

type QueuePanelProps = {
  songs: Song[]
  className?: string
  onReorder?: (songId: string, targetIndex: number) => void
  onRemove?: (songId: string) => void
  canRemove?: (song: Song) => boolean
}

export function QueuePanel({
  songs,
  className,
  onReorder,
  onRemove,
  canRemove,
}: QueuePanelProps) {
  const { t } = useI18n()

  return (
    <section
      className={cn(
        panelStyles({ padding: 'responsive' }),
        'flex min-h-0 flex-col',
        className,
      )}
    >
      <div className="mx-1 mb-4 flex items-center justify-between gap-4 md:mx-[7px]">
        <span className={sectionKickerStyles}>UP NEXT</span>
        <span
          className="grid size-8 shrink-0 place-items-center rounded-full border border-line bg-white/[0.035] font-mono text-xs font-bold text-muted"
          aria-label={t('queue.songCount', { count: songs.length })}
        >
          {songs.length}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <SongList
          songs={songs}
          emptyMessage={t('host.emptyQueue')}
          emptyDescription={t('queue.emptyDescription')}
          onReorder={onReorder}
          onRemove={onRemove}
          canRemove={canRemove}
        />
      </div>
    </section>
  )
}
