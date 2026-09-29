import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Check, Heart, ListMusic, Plus, Search, X } from 'lucide-react'
import { useAuth } from '../auth/context'
import { getErrorMessage, useI18n } from '../../shared/i18n/i18n-context'
import { buttonStyles, cn } from '../../shared/styles'
import type { Song } from '../room/types'
import { libraryApi, type Playlist } from './api'

export function SaveToPlaylistDialog({ song, onClose, onSavedChange }: {
  song: Song
  onClose: () => void
  onSavedChange: (saved: boolean) => void
}) {
  const { t } = useI18n()
  const { user, enabled, loading: authLoading, loginUrl } = useAuth()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)

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
    if (!user) {
      setLoading(false)
      return
    }
    let active = true
    void libraryApi.list(song.videoId).then(({ items }) => {
      if (active) setPlaylists(items)
    }).catch((cause: unknown) => {
      if (active) setError(getErrorMessage(cause, t))
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [user, song.videoId, t])

  async function toggle(playlist: Playlist) {
    if (savingId) return
    setError('')
    setSavingId(playlist.id)
    try {
      if (playlist.containsTrack) {
        await libraryApi.removeTrack(playlist.id, song.videoId)
      } else {
        await libraryApi.addTrack(playlist.id, song.id)
      }
      onSavedChange(!playlist.containsTrack || playlists.some((item) => item.id !== playlist.id && item.containsTrack))
      const { items } = await libraryApi.list(song.videoId)
      setPlaylists(items)
      onSavedChange(items.some((item) => item.containsTrack))
    } catch (cause) {
      setError(getErrorMessage(cause, t))
    } finally {
      setSavingId(null)
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (savingId || !name.trim()) return
    setError('')
    setSavingId('new')
    try {
      const playlist = await libraryApi.create(name)
      await libraryApi.addTrack(playlist.id, song.id)
      onSavedChange(true)
      const { items } = await libraryApi.list(song.videoId)
      setPlaylists(items)
      onSavedChange(items.some((item) => item.containsTrack))
      setName('')
      setCreating(false)
    } catch (cause) {
      setError(getErrorMessage(cause, t))
    } finally {
      setSavingId(null)
    }
  }

  const visible = playlists.filter((playlist) =>
    (playlist.kind === 'favorites' ? t('collection.favorites') : playlist.name)
      .toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  )

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); onClose() }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose() }}
      className="fixed inset-0 m-auto max-h-[min(650px,calc(100dvh-32px))] w-[min(500px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-line bg-[#1b1921] p-0 text-ink shadow-[0_24px_80px_rgba(0,0,0,.55)] backdrop:bg-black/65 backdrop:backdrop-blur-sm"
    >
      <div className="flex max-h-[min(650px,calc(100dvh-32px))] flex-col">
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pt-5 pb-3">
          <h2 id={titleId} className="m-0 text-lg font-bold">{t('library.addToPlaylist')}</h2>
          <button type="button" className={cn(buttonStyles({ intent: 'outline', size: 'sm' }), 'size-8 px-0')} aria-label={t('common.close')} onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {!authLoading && !user ? (
          <div className="space-y-4 px-5 pb-6 text-sm text-muted">
            <p>{t('library.loginRequired')}</p>
            {enabled && <a href={loginUrl()} className={buttonStyles({ intent: 'primary', size: 'md' })}>{t('auth.loginWithDiscord')}</a>}
          </div>
        ) : (
          <>
            <div className="shrink-0 space-y-3 px-5 pb-4">
              <label className="flex items-center gap-2 rounded-xl border border-line bg-white/5 px-3 py-2.5 text-muted focus-within:border-purple-light">
                <Search size={18} aria-hidden="true" />
                <span className="sr-only">{t('library.search')}</span>
                <input className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('library.search')} />
              </label>
              {creating ? (
                <form onSubmit={(event) => void create(event)} className="flex gap-2">
                  <input autoFocus aria-label={t('library.newName')} maxLength={60} value={name} onChange={(event) => setName(event.target.value)} placeholder={t('library.newName')} className="min-w-0 flex-1 rounded-lg border border-line bg-white/5 px-3 py-2 text-sm outline-none focus:border-purple-light" />
                  <button type="submit" disabled={!name.trim() || Boolean(savingId)} className={buttonStyles({ intent: 'primary', size: 'sm' })}>{t('library.create')}</button>
                </form>
              ) : (
                <button type="button" disabled={loading} onClick={() => setCreating(true)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm font-semibold text-ink hover:bg-white/8 focus-visible:outline-2 focus-visible:outline-purple-light">
                  <Plus size={20} aria-hidden="true" />{t('library.newPlaylist')}
                </button>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto border-t border-line px-5 py-4 [scrollbar-width:thin]">
              <p className="mb-3 text-xs font-bold text-muted">{t('library.savedPlaylists')}</p>
              {loading ? <p className="text-sm text-muted">{t('library.loading')}</p> : visible.length === 0 ? <p className="text-sm text-muted">{t('library.noPlaylists')}</p> : (
                <div className="space-y-1.5">
                  {visible.map((playlist) => (
                    <button key={playlist.id} type="button" disabled={Boolean(savingId)} onClick={() => void toggle(playlist)} aria-pressed={playlist.containsTrack} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-purple-light disabled:opacity-60">
                      <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-gradient-to-br from-purple to-[#9de0cf] text-white">
                        {playlist.kind === 'favorites' ? <Heart size={22} fill="currentColor" aria-hidden="true" /> : playlist.thumbnailUrl ? <img className="size-full object-cover" src={playlist.thumbnailUrl} alt="" /> : <ListMusic size={21} aria-hidden="true" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{playlist.kind === 'favorites' ? t('collection.favorites') : playlist.name}</span>
                        <span className="text-xs text-muted">{t('library.trackCount', { count: playlist.trackCount })}</span>
                      </span>
                      <span className={cn('grid size-6 shrink-0 place-items-center rounded-full border', playlist.containsTrack ? 'border-lime bg-lime text-canvas' : 'border-muted text-transparent')} aria-hidden="true"><Check size={15} /></span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {error && <p role="alert" className="mx-5 mb-2 text-sm text-danger">{error}</p>}
            <div className="flex shrink-0 justify-end border-t border-line px-5 py-3">
              <button type="button" onClick={onClose} className={buttonStyles({ intent: 'outline', size: 'sm' })}>{t('common.close')}</button>
            </div>
          </>
        )}
      </div>
    </dialog>
  )
}
