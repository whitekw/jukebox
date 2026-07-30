import { ChevronIcon, TrashIcon } from './Icons'
import { formatDuration } from '../format'
import type { Song } from '../types'

export function SongList({
  songs,
  emptyMessage,
  onMove,
  onRemove,
}: {
  songs: Song[]
  emptyMessage: string
  onMove?: (songId: string, direction: 'up' | 'down') => void
  onRemove?: (songId: string) => void
}) {
  if (songs.length === 0) {
    return <div className="empty-state">{emptyMessage}</div>
  }

  return (
    <ol className="song-list">
      {songs.map((song, index) => (
        <li className="song-item" key={song.id}>
          <span className="song-index">{String(index + 1).padStart(2, '0')}</span>
          <img src={song.thumbnailUrl} alt="" className="song-thumb" />
          <div className="song-copy">
            <strong>{song.title}</strong>
            <span>{song.artist}</span>
            <small>{song.addedBy}의 신청곡</small>
          </div>
          <span className="song-duration">{formatDuration(song.durationSeconds)}</span>
          {(onMove || onRemove) && (
            <div className="song-actions">
              {onMove && (
                <>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label="앞으로 이동"
                    disabled={index === 0}
                    onClick={() => onMove(song.id, 'up')}
                  >
                    <ChevronIcon direction="up" size={17} />
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label="뒤로 이동"
                    disabled={index === songs.length - 1}
                    onClick={() => onMove(song.id, 'down')}
                  >
                    <ChevronIcon direction="down" size={17} />
                  </button>
                </>
              )}
              {onRemove && (
                <button
                  className="icon-button danger"
                  type="button"
                  aria-label="대기열에서 삭제"
                  onClick={() => onRemove(song.id)}
                >
                  <TrashIcon size={17} />
                </button>
              )}
            </div>
          )}
        </li>
      ))}
    </ol>
  )
}
