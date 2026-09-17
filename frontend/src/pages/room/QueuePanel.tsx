import { SongList } from '../../components/SongList'
import { useI18n } from '../../i18n-context'
import { cn, panelStyles, sectionKickerStyles } from '../../styles'
import type { Song } from '../../types'

type QueuePanelProps = {
  songs: Song[]
  className?: string
  onReorder?: (songId: string, targetIndex: number) => void
  onRemove?: (songId: string) => void
}

export function QueuePanel({
  songs,
  className,
  onReorder,
  onRemove,
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
      <div className="mx-1 mb-4 flex items-end justify-between gap-4 md:mx-[7px]">
        <div>
          <span className={sectionKickerStyles}>UP NEXT</span>
          <h2 className="mt-1.5 text-xl tracking-[-0.03em] md:text-[23px]">
            {t('queue.next')}
          </h2>
        </div>
        <span
          className="grid size-8 shrink-0 place-items-center rounded-full border border-line bg-white/[0.035] font-mono text-xs font-bold text-muted"
          aria-label={t('queue.songCount', { count: songs.length })}
        >
          {songs.length}
        </span>
      </div>
      <SongList
        songs={songs}
        emptyMessage={t('host.emptyQueue')}
        emptyDescription={t('queue.emptyDescription')}
        onReorder={onReorder}
        onRemove={onRemove}
      />
    </section>
  )
}
