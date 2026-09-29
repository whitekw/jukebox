import { useEffect, useId, useRef, useState } from 'react'
import { Heart, ListMusic, X } from 'lucide-react'
import { formatDuration } from '../../shared/format'
import { getErrorMessage, useI18n } from '../../shared/i18n/i18n-context'
import { buttonStyles, cn } from '../../shared/styles'
import { libraryApi, type LibraryTrack, type Playlist } from './api'

export function PlaylistTracksDialog({ playlist, revision, onClose }: {
  playlist: Playlist
  revision: number
  onClose: () => void
}) {
  const { t } = useI18n()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [tracks, setTracks] = useState<LibraryTrack[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const name = playlist.kind === 'favorites' ? t('collection.favorites') : playlist.name

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.showModal()
    return () => {
      const restoreFocus = dialog.contains(document.activeElement)
      dialog.close()
      if (restoreFocus) trigger?.focus()
    }
  }, [])

  useEffect(() => {
    let active = true
    void libraryApi.getTracks(playlist.id).then(({ items }) => {
      if (!active) return
      setTracks(items)
      setError('')
    }).catch((cause: unknown) => {
      if (active) setError(getErrorMessage(cause, t))
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [playlist.id, revision, retry, t])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); onClose() }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose() }}
      className="fixed inset-0 m-auto max-h-[min(700px,calc(100dvh-32px))] w-[min(560px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-line bg-[#1b1921] p-0 text-ink shadow-[0_24px_80px_rgba(0,0,0,.55)] backdrop:bg-black/65 backdrop:backdrop-blur-sm"
    >
      <div className="flex max-h-[min(700px,calc(100dvh-32px))] flex-col">
        <div className="flex shrink-0 items-center gap-3 border-b border-line px-5 py-4">
          <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-gradient-to-br from-purple to-[#9de0cf] text-white">
            {playlist.kind === 'favorites' ? <Heart size={22} fill="currentColor" aria-hidden="true" /> : playlist.thumbnailUrl ? <img src={playlist.thumbnailUrl} alt="" className="size-full object-cover" /> : <ListMusic size={21} aria-hidden="true" />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="m-0 truncate text-lg font-bold" title={name}>{name}</h2>
            <p className="m-0 text-xs text-muted">{t('library.trackCount', { count: playlist.trackCount })}</p>
          </div>
          <button type="button" className={cn(buttonStyles({ intent: 'outline', size: 'sm' }), 'size-8 shrink-0 px-0')} aria-label={t('common.close')} onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto p-4 [scrollbar-width:thin]">
          {loading && !tracks.length ? <p className="px-2 py-6 text-center text-sm text-muted">{t('library.loading')}</p> :
            error ? <div className="flex flex-col items-center gap-3 px-2 py-6"><p role="alert" className="text-sm text-danger">{error}</p><button type="button" className={buttonStyles({ intent: 'outline', size: 'sm' })} onClick={() => { setLoading(true); setRetry((value) => value + 1) }}>{t('common.retry')}</button></div> :
              tracks.length === 0 ? <p className="px-2 py-6 text-center text-sm text-muted">{t('library.emptyPlaylist')}</p> :
                <ul className="m-0 space-y-1 p-0">
                  {tracks.map((track) => (
                    <li key={track.videoId} className="flex min-w-0 items-center gap-3 rounded-xl px-2 py-2">
                      <img src={track.thumbnailUrl} alt="" className="h-12 w-[85px] shrink-0 rounded-md object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="m-0 truncate text-sm font-semibold" title={track.title}>{track.title}</p>
                        <p className="m-0 truncate text-xs text-muted">{track.artist}</p>
                      </div>
                      <span className="shrink-0 font-mono text-xs text-muted">{formatDuration(track.durationSeconds)}</span>
                    </li>
                  ))}
                </ul>}
        </div>
      </div>
    </dialog>
  )
}
