import { useState, type DragEvent } from 'react'
import { MusicIcon, TrashIcon } from '../../../shared/ui/Icons'
import { formatDuration } from '../../../shared/format'
import { useI18n } from '../../../shared/i18n/i18n-context'
import { cn } from '../../../shared/styles'
import type { Song } from '../types'

export function SongList({
  songs,
  emptyMessage,
  emptyDescription,
  onReorder,
  onRemove,
  canRemove,
}: {
  songs: Song[]
  emptyMessage: string
  emptyDescription?: string
  onReorder?: (songId: string, targetIndex: number) => void
  onRemove?: (songId: string) => void
  canRemove?: (song: Song) => boolean
}) {
  const { t } = useI18n()
  const [draggedSongId, setDraggedSongId] = useState('')
  const [dropTarget, setDropTarget] = useState<{
    songId: string
    edge: 'before' | 'after'
  } | null>(null)

  function startDragging(event: DragEvent<HTMLLIElement>, songId: string) {
    if (!onReorder || songs.length < 2) {
      event.preventDefault()
      return
    }
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', songId)
    setDraggedSongId(songId)
  }

  function markDropTarget(event: DragEvent<HTMLLIElement>, songId: string) {
    if (!onReorder || !draggedSongId || draggedSongId === songId) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    const bounds = event.currentTarget.getBoundingClientRect()
    const edge = event.clientY < bounds.top + bounds.height / 2
      ? 'before'
      : 'after'
    setDropTarget({ songId, edge })
  }

  function finishDragging() {
    setDraggedSongId('')
    setDropTarget(null)
  }

  function dropSong(event: DragEvent<HTMLLIElement>, targetSongId: string) {
    event.preventDefault()
    const sourceSongId =
      draggedSongId || event.dataTransfer.getData('text/plain')
    const edge = dropTarget?.songId === targetSongId
      ? dropTarget.edge
      : 'before'
    const remainingSongs = songs.filter((song) => song.id !== sourceSongId)
    const targetIndex = remainingSongs.findIndex(
      (song) => song.id === targetSongId,
    )

    if (sourceSongId && targetIndex >= 0) {
      const insertionIndex = targetIndex + (edge === 'after' ? 1 : 0)
      const sourceIndex = songs.findIndex((song) => song.id === sourceSongId)
      if (sourceIndex !== insertionIndex) {
        onReorder?.(sourceSongId, insertionIndex)
      }
    }
    finishDragging()
  }

  if (songs.length === 0) {
    return (
      <div className="flex min-h-[190px] flex-1 flex-col items-center justify-center px-4 py-8 text-center md:min-h-[220px]">
        <div className="mb-4 grid size-12 place-items-center rounded-full border border-line bg-white/[0.035] text-muted">
          <MusicIcon size={20} />
        </div>
        <p className="m-0 text-sm font-semibold text-muted">{emptyMessage}</p>
        {emptyDescription && (
          <p className="mt-1.5 mb-0 max-w-[270px] text-[11px] leading-[1.65] text-dim">
            {emptyDescription}
          </p>
        )}
      </div>
    )
  }

  return (
    <ol className="m-0 flex list-none flex-col gap-[7px] p-0">
      {songs.map((song) => (
        <li
          className={cn(
            'relative flex min-h-[68px] items-center gap-[11px] rounded-[11px] border border-transparent bg-white/[0.035] p-2 transition-[border-color,background-color,opacity] hover:border-line hover:bg-white/[0.055]',
            onReorder && songs.length > 1 &&
              'cursor-grab select-none active:cursor-grabbing',
            draggedSongId === song.id && 'opacity-35',
            dropTarget?.songId === song.id && dropTarget.edge === 'before' &&
              'before:absolute before:-top-1 before:right-2 before:left-2 before:h-0.5 before:rounded-full before:bg-lime before:shadow-[0_0_10px_rgba(215,255,100,.45)]',
            dropTarget?.songId === song.id && dropTarget.edge === 'after' &&
              'after:absolute after:-bottom-1 after:right-2 after:left-2 after:h-0.5 after:rounded-full after:bg-lime after:shadow-[0_0_10px_rgba(215,255,100,.45)]',
          )}
          key={song.id}
          draggable={Boolean(onReorder && songs.length > 1)}
          title={onReorder && songs.length > 1 ? t('song.dragToReorder') : undefined}
          onDragStart={(event) => startDragging(event, song.id)}
          onDragOver={(event) => markDropTarget(event, song.id)}
          onDrop={(event) => dropSong(event, song.id)}
          onDragEnd={finishDragging}
        >
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
            <span className="mt-1 flex min-w-0 items-center gap-1.5">
              <span className="grid size-[18px] shrink-0 place-items-center overflow-hidden rounded-full border border-purple/25 bg-purple/[0.08] text-[10px] font-bold text-purple-light" aria-hidden="true">
                {song.addedByAvatarUrl ? (
                  <img className="size-full object-cover" src={song.addedByAvatarUrl} alt="" />
                ) : (
                  song.addedBy.trim().slice(0, 1).toUpperCase()
                )}
              </span>
              <small className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-dim">
                {t('song.requestedBy', { nickname: song.addedBy })}
              </small>
            </span>
          </div>
          <span className="hidden font-mono text-[10px] text-dim md:inline">
            {formatDuration(song.durationSeconds)}
          </span>
          {onRemove && (canRemove?.(song) ?? true) && (
            <button
              className={cn(
                'grid size-[29px] shrink-0 place-items-center rounded-[7px] border-0 bg-transparent p-0',
                'text-[#847e8c] hover:bg-danger/[0.08] hover:text-danger',
              )}
              type="button"
              draggable={false}
              aria-label={t('song.removeFromQueue')}
              onClick={() => onRemove(song.id)}
            >
              <TrashIcon size={17} />
            </button>
          )}
        </li>
      ))}
    </ol>
  )
}
