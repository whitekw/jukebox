import { useEffect, useId, useRef, useState } from 'react'
import { Heart, ListMusic, X } from 'lucide-react'
import { getErrorMessage, useI18n } from '../../shared/i18n/i18n-context'
import { buttonStyles, cn } from '../../shared/styles'
import { VideoResultList } from '../room/components/VideoResultList'
import { libraryApi, type LibraryTrack, type Playlist } from './api'

export function PlaylistTracksPanel({ playlist, revision, onClose, onAddSong, message, roomError }: {
  playlist: Playlist
  revision: number
  onClose: () => void
  onAddSong?: (videoId: string) => Promise<void>
  message: string
  roomError: string
}) {
  const { t } = useI18n()
  const panelRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const [tracks, setTracks] = useState<LibraryTrack[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [addingId, setAddingId] = useState('')
  const name = playlist.kind === 'favorites' ? t('collection.favorites') : playlist.name

  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const panel = panelRef.current
    closeButtonRef.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing ||
        document.querySelector('dialog:modal')) return
      event.preventDefault()
      onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      if (panel?.contains(document.activeElement)) trigger?.focus()
    }
  }, [onClose])

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

  async function addSong(videoId: string) {
    if (!onAddSong || addingId) return
    setAddingId(videoId)
    try {
      await onAddSong(videoId)
    } finally {
      if (panelRef.current) setAddingId('')
    }
  }

  return (
    <section ref={panelRef} aria-labelledby={titleId} className="absolute inset-0 z-20 flex min-h-0 flex-col overflow-hidden bg-canvas p-4 text-ink sm:p-6">
      <div className="mb-5 flex shrink-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-gradient-to-br from-purple to-[#9de0cf] text-white">
            {playlist.kind === 'favorites' ? <Heart size={21} fill="currentColor" aria-hidden="true" /> : playlist.thumbnailUrl ? <img src={playlist.thumbnailUrl} alt="" className="size-full object-cover" /> : <ListMusic size={20} aria-hidden="true" />}
          </span>
          <div className="min-w-0">
            <h2 id={titleId} className="m-0 truncate text-xl font-bold" title={name}>{name}</h2>
            <p className="m-0 text-xs text-muted">{t('library.trackCount', { count: loading || error ? playlist.trackCount : tracks.length })}</p>
          </div>
        </div>
        <button ref={closeButtonRef} type="button" className={cn(buttonStyles({ intent: 'outline', size: 'sm' }), 'size-8 shrink-0 px-0')} aria-label={t('common.close')} onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {loading && !tracks.length ? <p className="py-8 text-center text-sm text-muted">{t('library.loading')}</p> :
          error ? <div className="flex flex-col items-center gap-3 py-8"><p role="alert" className="text-sm text-danger">{error}</p><button type="button" className={buttonStyles({ intent: 'outline', size: 'sm' })} onClick={() => { setLoading(true); setRetry((value) => value + 1) }}>{t('common.retry')}</button></div> :
            tracks.length === 0 ? <p className="py-8 text-center text-sm text-muted">{t('library.emptyPlaylist')}</p> :
              <VideoResultList videos={tracks.map((track) => ({ ...track, embeddable: true }))} addingId={addingId} onAddSong={onAddSong ? (videoId) => void addSong(videoId) : undefined} />}
      </div>
      {roomError && <p className="mt-3 shrink-0 text-sm text-danger" role="alert">{roomError}</p>}
      {message && !roomError && <p className="mt-3 shrink-0 text-sm text-lime" role="status">{message}</p>}
    </section>
  )
}
