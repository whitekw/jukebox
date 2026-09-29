import { useEffect, useState, type DragEvent } from 'react'
import { Check, CirclePlus, Music2 as MusicIcon, Trash2 as TrashIcon } from 'lucide-react'
import { useAuth } from '../../auth/context'
import { libraryApi } from '../../library/api'
import { useI18n } from '../../../shared/i18n/i18n-context'
import { cn } from '../../../shared/styles'
import { SaveToPlaylistDialog } from '../../library/SaveToPlaylistDialog'
import type { Song } from '../types'

export function SongList({
  songs,
  emptyMessage,
  emptyDescription,
  onReorder,
  onRemove,
  canRemove,
  onLibraryChange,
  libraryRevision,
}: {
  songs: Song[]
  emptyMessage: string
  emptyDescription?: string
  onReorder?: (songId: string, targetIndex: number) => void
  onRemove?: (songId: string) => void
  canRemove?: (song: Song) => boolean
  onLibraryChange: () => void
  libraryRevision: number
}) {
  const { t } = useI18n()
  const { user } = useAuth()
  const [saveSong, setSaveSong] = useState<Song | null>(null)
  const [savedMembership, setSavedMembership] = useState<{
    userId: string
    byVideoId: Record<string, boolean>
  } | null>(null)
  const [draggedSongId, setDraggedSongId] = useState('')
  const [dropTarget, setDropTarget] = useState<{
    songId: string
    edge: 'before' | 'after'
  } | null>(null)
  const videoIdsKey = [...new Set(songs.map((song) => song.videoId))].sort().join(',')

  useEffect(() => {
    if (!user?.id || !videoIdsKey) return
    let active = true
    const userId = user.id
    void Promise.allSettled(videoIdsKey.split(',').map(async (videoId) => {
      const { items } = await libraryApi.list(videoId)
      return { videoId, saved: items.some((playlist) => playlist.containsTrack) }
    })).then((results) => {
      if (!active) return
      setSavedMembership((previous) => {
        const byVideoId = previous?.userId === userId ? { ...previous.byVideoId } : {}
        for (const result of results) {
          if (result.status === 'fulfilled') byVideoId[result.value.videoId] = result.value.saved
        }
        return { userId, byVideoId }
      })
    })
    return () => { active = false }
  }, [user?.id, videoIdsKey, libraryRevision])
  const savedByVideoId: Record<string, boolean> = user && savedMembership?.userId === user.id
    ? savedMembership.byVideoId
    : {}

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
    <>
    <ol className="m-0 flex list-none flex-col gap-[7px] p-0">
      {songs.map((song) => (
        <li
          className={cn(
            'relative flex min-h-[68px] items-center gap-[11px] rounded-[4px] border border-transparent bg-white/[0.035] p-2 transition-[border-color,background-color,opacity] hover:border-line hover:bg-white/[0.055]',
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
            className="aspect-video w-[62px] shrink-0 rounded-[4px] bg-[#17151c] object-cover md:w-[72px]"
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px]">
              {song.title}
            </strong>
            <span className="overflow-hidden text-ellipsis whitespace-nowrap pr-16 text-[11px] text-muted">
              {song.artist}
            </span>
            <span className="mt-1 flex min-w-0 items-center gap-1.5 pr-16">
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
          <div className="absolute right-1.5 bottom-1.5 flex items-center gap-0.5">
            <button
              className="grid size-7 place-items-center rounded-[7px] border-0 bg-transparent p-0 text-muted transition-colors hover:bg-purple/10 hover:text-purple-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-light"
              type="button"
              draggable={false}
              aria-label={`${song.title} · ${t(savedByVideoId[song.videoId] ? 'library.savedInPlaylist' : 'library.addToPlaylist')}`}
              title={t(savedByVideoId[song.videoId] ? 'library.savedInPlaylist' : 'library.addToPlaylist')}
              onClick={() => setSaveSong(song)}
            >
              {savedByVideoId[song.videoId]
                ? <span className="grid size-5 place-items-center rounded-full bg-lime text-canvas"><Check size={14} strokeWidth={3} aria-hidden="true" /></span>
                : <CirclePlus size={18} aria-hidden="true" />}
            </button>
            {onRemove && (canRemove?.(song) ?? true) && (
              <button
                className="grid size-7 place-items-center rounded-[7px] border-0 bg-transparent p-0 text-[#847e8c] transition-colors hover:bg-danger/[0.08] hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
                type="button"
                draggable={false}
                aria-label={`${song.title} · ${t('song.removeFromQueue')}`}
                title={t('song.removeFromQueue')}
                onClick={() => onRemove(song.id)}
              >
                <TrashIcon size={17} aria-hidden="true" />
              </button>
            )}
          </div>
        </li>
      ))}
    </ol>
    {saveSong && <SaveToPlaylistDialog
      key={saveSong.id}
      song={{ videoId: saveSong.videoId, roomSongId: saveSong.id }}
      onClose={() => setSaveSong(null)}
      onSavedChange={(saved) => {
        if (!user) return
        setSavedMembership((previous) => ({
          userId: user.id,
          byVideoId: { ...(previous?.userId === user.id ? previous.byVideoId : {}), [saveSong.videoId]: saved },
        }))
      }}
      onLibraryChange={onLibraryChange}
    />}
    </>
  )
}
