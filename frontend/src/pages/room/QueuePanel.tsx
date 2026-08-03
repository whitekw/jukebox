import { SongList } from '../../components/SongList'
import { useI18n } from '../../i18n-context'
import { panelStyles, sectionKickerStyles } from '../../styles'
import type { Song } from '../../types'

type QueuePanelProps = {
  songs: Song[]
  onMove?: (songId: string, direction: 'up' | 'down') => void
  onRemove?: (songId: string) => void
}

export function QueuePanel({ songs, onMove, onRemove }: QueuePanelProps) {
  const { t } = useI18n()

  return (
    <section className={panelStyles({ padding: 'responsive' })}>
      <div className="mx-1 mb-[18px] flex items-end justify-between md:mx-[7px]">
        <div>
          <span className={sectionKickerStyles}>UP NEXT</span>
          <h2 className="mt-1.5 text-xl tracking-[-0.03em] md:text-[23px]">
            {t('queue.next')}{' '}
            <b className="text-[13px] font-semibold text-dim">{songs.length}</b>
          </h2>
        </div>
      </div>
      <SongList
        songs={songs}
        emptyMessage={t('host.emptyQueue')}
        onMove={onMove}
        onRemove={onRemove}
      />
    </section>
  )
}
