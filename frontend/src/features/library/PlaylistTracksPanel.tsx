import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Heart, ListMusic, Pencil, Trash2 } from 'lucide-react'
import { getErrorMessage, useI18n } from '../../shared/i18n/i18n-context'
import { buttonStyles, panelCloseButtonStyles } from '../../shared/styles'
import { PanelHeader } from '../../shared/ui/PanelHeader'
import { VideoResultList } from '../room/components/VideoResultList'
import { libraryApi, type LibraryTrack, type Playlist } from './api'
import { SaveToPlaylistDialog } from './SaveToPlaylistDialog'
import { YouTubePlaylistBadge } from './YouTubePlaylistBadge'

export function PlaylistTracksPanel({ playlist, revision, onClose, onAddSong, queuedVideoIds, currentVideoId, onLibraryChange, onPlaylistRenamed, onPlaylistDeleted, message, roomError }: {
  playlist: Playlist
  revision: number
  onClose: () => void
  onAddSong?: (videoId: string) => Promise<void>
  queuedVideoIds: ReadonlySet<string>
  currentVideoId: string | null
  onLibraryChange: () => void
  onPlaylistRenamed: (name: string, updatedAt: number) => void
  onPlaylistDeleted: () => void
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
  const [managedTrack, setManagedTrack] = useState<LibraryTrack | null>(null)
  const [mutationError, setMutationError] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(playlist.name)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [savingPlaylist, setSavingPlaylist] = useState(false)
  const name = playlist.kind === 'favorites' ? t('collection.favorites') : playlist.name
  const coverUrl = loading || error ? playlist.thumbnailUrl : tracks[0]?.thumbnailUrl

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

  async function renamePlaylist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (savingPlaylist || !nameDraft.trim()) return
    setSavingPlaylist(true)
    setMutationError('')
    try {
      const updated = await libraryApi.rename(playlist.id, nameDraft)
      onPlaylistRenamed(updated.name, updated.updatedAt)
      setNameDraft(updated.name)
      setEditingName(false)
    } catch (cause) {
      setMutationError(getErrorMessage(cause, t))
    } finally {
      if (panelRef.current) setSavingPlaylist(false)
    }
  }

  async function deletePlaylist() {
    if (savingPlaylist) return
    setSavingPlaylist(true)
    setMutationError('')
    try {
      await libraryApi.remove(playlist.id)
      onPlaylistDeleted()
    } catch (cause) {
      if (panelRef.current) {
        setMutationError(getErrorMessage(cause, t))
        setSavingPlaylist(false)
      }
    }
  }

  return (
    <section ref={panelRef} aria-labelledby={titleId} className="absolute inset-0 z-20 flex min-h-0 flex-col overflow-hidden bg-canvas text-ink">
      <PanelHeader titleId={titleId} title={name}
        subtitle={<span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>{t('library.trackCount', { count: loading || error ? playlist.trackCount : tracks.length })}</span>
          {playlist.isYouTubeSynced && <YouTubePlaylistBadge />}
        </span>}
        icon={playlist.kind === 'favorites' ? <Heart size={21} fill="currentColor" aria-hidden="true" /> : coverUrl ? <img src={coverUrl} alt="" className="size-full object-cover" /> : <ListMusic size={20} aria-hidden="true" />}
        iconClassName={playlist.kind === 'favorites' ? 'bg-gradient-to-br from-purple to-[#9de0cf] text-white' : undefined}
        closeLabel={t('common.close')} onClose={onClose} closeButtonRef={closeButtonRef}
        actions={playlist.kind === 'custom' && <>
            <button type="button" className={panelCloseButtonStyles} aria-label={t('library.renamePlaylist')} title={t('library.renamePlaylist')} disabled={savingPlaylist} onClick={() => { setConfirmingDelete(false); setNameDraft(playlist.name); setEditingName(true); setMutationError('') }}>
              <Pencil size={17} aria-hidden="true" />
            </button>
            <button type="button" className={panelCloseButtonStyles} aria-label={t('library.deletePlaylist')} title={t('library.deletePlaylist')} disabled={savingPlaylist} onClick={() => { setEditingName(false); setConfirmingDelete(true); setMutationError('') }}>
              <Trash2 size={17} aria-hidden="true" />
            </button>
          </>} />
      <div className="flex min-h-0 flex-1 flex-col px-4 py-5 sm:px-6">
        {editingName && <form onSubmit={(event) => void renamePlaylist(event)} className="mb-5 flex shrink-0 flex-wrap gap-2">
          <input autoFocus aria-label={t('library.newName')} maxLength={60} value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-line bg-white/5 px-3 py-2 text-sm text-ink outline-none focus:border-purple-light" />
          <button type="submit" disabled={savingPlaylist || !nameDraft.trim()} className={buttonStyles({ intent: 'primary', size: 'sm' })}>{t('library.saveName')}</button>
          <button type="button" disabled={savingPlaylist} className={buttonStyles({ intent: 'outline', size: 'sm' })} onClick={() => setEditingName(false)}>{t('common.cancel')}</button>
        </form>}
        {confirmingDelete && <div className="mb-5 shrink-0 rounded-xl border border-danger/30 bg-danger/[0.08] p-3">
          <p className="m-0 text-sm text-ink">{t('library.deleteConfirm', { name })}</p>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" disabled={savingPlaylist} className={buttonStyles({ intent: 'outline', size: 'sm' })} onClick={() => setConfirmingDelete(false)}>{t('common.cancel')}</button>
            <button type="button" disabled={savingPlaylist} className="min-h-9 rounded-[10px] bg-danger px-3 text-xs font-bold text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger disabled:opacity-45" onClick={() => void deletePlaylist()}>{t('library.deletePlaylist')}</button>
          </div>
        </div>}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin] [scrollbar-color:var(--color-dim)_transparent]">
          {loading && !tracks.length ? <p className="py-8 text-center text-sm text-muted">{t('library.loading')}</p> :
            error ? <div className="flex flex-col items-center gap-3 py-8"><p role="alert" className="text-sm text-danger">{error}</p><button type="button" className={buttonStyles({ intent: 'outline', size: 'sm' })} onClick={() => { setLoading(true); setRetry((value) => value + 1) }}>{t('common.retry')}</button></div> :
              tracks.length === 0 ? <p className="py-8 text-center text-sm text-muted">{t('library.emptyPlaylist')}</p> :
                <VideoResultList videos={tracks.map((track) => ({ ...track, embeddable: true }))} addingId={addingId}
                  queuedVideoIds={queuedVideoIds} currentVideoId={currentVideoId}
                  onAddSong={onAddSong ? (videoId) => void addSong(videoId) : undefined}
                  onManageSaved={(videoId) => setManagedTrack(tracks.find((track) => track.videoId === videoId) ?? null)} />}
        </div>
        {mutationError && <p className="mt-3 shrink-0 text-sm text-danger" role="alert">{mutationError}</p>}
        {roomError && <p className="mt-3 shrink-0 text-sm text-danger" role="alert">{roomError}</p>}
        {message && !roomError && <p className="mt-3 shrink-0 text-sm text-lime" role="status">{message}</p>}
        {managedTrack && <SaveToPlaylistDialog
          key={managedTrack.videoId}
          song={managedTrack}
          onClose={() => setManagedTrack(null)}
          onLibraryChange={onLibraryChange}
        />}
      </div>
    </section>
  )
}
