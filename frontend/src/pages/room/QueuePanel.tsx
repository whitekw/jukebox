import { SongList } from '../../components/SongList'
import type { Song } from '../../types'

type QueuePanelProps = {
  songs: Song[]
  onMove?: (songId: string, direction: 'up' | 'down') => void
  onRemove?: (songId: string) => void
}

export function QueuePanel({ songs, onMove, onRemove }: QueuePanelProps) {
  return (
    <section className="guest-queue-panel">
      <div className="guest-section-heading">
        <div>
          <span className="section-kicker">UP NEXT</span>
          <h2>다음 곡 <b>{songs.length}</b></h2>
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
