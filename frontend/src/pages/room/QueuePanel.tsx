import { SongList } from '../../components/SongList'
import { panelStyles, sectionKickerStyles } from '../../styles'
import type { Song } from '../../types'

type QueuePanelProps = {
  songs: Song[]
  onMove?: (songId: string, direction: 'up' | 'down') => void
  onRemove?: (songId: string) => void
}

export function QueuePanel({ songs, onMove, onRemove }: QueuePanelProps) {
  return (
    <section className={panelStyles({ padding: 'responsive' })}>
      <div className="mx-1 mb-[18px] flex items-end justify-between md:mx-[7px]">
        <div>
          <span className={sectionKickerStyles}>UP NEXT</span>
          <h2 className="mt-1.5 text-xl tracking-[-0.03em] md:text-[23px]">
            다음 곡{' '}
            <b className="text-[13px] font-semibold text-dim">{songs.length}</b>
          </h2>
        </div>
      </div>
      <SongList
        songs={songs}
        emptyMessage="아직 대기 중인 곡이 없습니다."
        onMove={onMove}
        onRemove={onRemove}
      />
    </section>
  )
}
