import { ChevronIcon, TrashIcon } from './Icons'
import { formatDuration } from '../format'
import { useI18n } from '../i18n-context'
import { cn } from '../styles'
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
  const { t } = useI18n()

  if (songs.length === 0) {
    return (
      <div className="grid min-h-28 place-items-center rounded-[11px] border border-dashed border-line p-5 text-center text-dim">
        {emptyMessage}
      </div>
    )
  }

  return (
    <ol className="m-0 flex list-none flex-col gap-[7px] p-0">
      {songs.map((song, index) => (
        <li
          className="flex min-h-[68px] items-center gap-[11px] rounded-[11px] border border-transparent bg-white/[0.035] p-2 transition-colors hover:border-line hover:bg-white/[0.055]"
          key={song.id}
        >
          <span className="hidden w-[22px] font-mono text-[10px] text-[#5d5865] md:inline">
            {String(index + 1).padStart(2, '0')}
          </span>
          <img
            src={song.thumbnailUrl}
            alt=""
            className="aspect-video w-[62px] shrink-0 rounded-[7px] bg-[#17151c] object-cover md:w-[72px]"
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px]">
              {song.title}
            </strong>
            <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-muted">
              {song.artist}
            </span>
            <small className="mt-0.5 text-[9px] text-[#66606d]">
              {t('song.requestedBy', { nickname: song.addedBy })}
            </small>
          </div>
          <span className="hidden font-mono text-[10px] text-dim md:inline">
            {formatDuration(song.durationSeconds)}
          </span>
          {(onMove || onRemove) && (
            <div className="flex flex-col items-center gap-0.5 md:flex-row">
              {onMove && (
                <>
                  <button
                    className="grid size-[29px] place-items-center rounded-[7px] border-0 bg-transparent p-0 text-[#847e8c] hover:bg-white/[0.07] hover:text-ink disabled:cursor-not-allowed disabled:opacity-45"
                    type="button"
                    aria-label={t('song.moveUp')}
                    disabled={index === 0}
                    onClick={() => onMove(song.id, 'up')}
                  >
                    <ChevronIcon direction="up" size={17} />
                  </button>
                  <button
                    className="grid size-[29px] place-items-center rounded-[7px] border-0 bg-transparent p-0 text-[#847e8c] hover:bg-white/[0.07] hover:text-ink disabled:cursor-not-allowed disabled:opacity-45"
                    type="button"
                    aria-label={t('song.moveDown')}
                    disabled={index === songs.length - 1}
                    onClick={() => onMove(song.id, 'down')}
                  >
                    <ChevronIcon direction="down" size={17} />
                  </button>
                </>
              )}
              {onRemove && (
                <button
                  className={cn(
                    'grid size-[29px] place-items-center rounded-[7px] border-0 bg-transparent p-0',
                    'text-[#847e8c] hover:bg-danger/[0.08] hover:text-danger',
                  )}
                  type="button"
                  aria-label={t('song.removeFromQueue')}
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
