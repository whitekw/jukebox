import { useEffect, useMemo, useRef, useState } from 'react'
import { RotateCw } from 'lucide-react'
import { useAuth } from '../../auth/context'
import { libraryApi } from '../../library/api'
import { SaveToPlaylistDialog } from '../../library/SaveToPlaylistDialog'
import { PlaylistSaveIcon } from '../../library/PlaylistSaveIcon'
import { getErrorMessage, useI18n } from '../../../shared/i18n/i18n-context'
import { roomApi } from '../api'
import type { RoomHistoryEntry } from '../types'
import { AddToQueueButton } from './AddToQueueButton'

export function RoomPlaybackHistory({ code, participantToken, revision, onAddSong, onLibraryChange, libraryRevision, message, roomError }: {
  code: string
  participantToken: string
  revision: string
  onAddSong: (videoId: string) => Promise<void>
  onLibraryChange: () => void
  libraryRevision: number
  message: string
  roomError: string
}) {
  const { locale, t } = useI18n()
  const { user } = useAuth()
  const [items, setItems] = useState<RoomHistoryEntry[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [addingId, setAddingId] = useState('')
  const [saveSong, setSaveSong] = useState<RoomHistoryEntry | null>(null)
  const [savedMembership, setSavedMembership] = useState<{
    userId: string
    byVideoId: Record<string, boolean>
  } | null>(null)
  const requestGeneration = useRef(0)
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium', timeStyle: 'short',
  }), [locale])
  const savedByVideoId: Record<string, boolean> = user && savedMembership?.userId === user.id
    ? savedMembership.byVideoId : {}

  useEffect(() => {
    if (!user?.id) return
    let active = true
    const userId = user.id
    void libraryApi.savedVideoIds().then(({ videoIds }) => {
      if (active) setSavedMembership({ userId, byVideoId: Object.fromEntries(videoIds.map((videoId) => [videoId, true])) })
    }).catch(() => {})
    return () => { active = false }
  }, [user?.id, libraryRevision])

  useEffect(() => {
    const generation = ++requestGeneration.current
    let active = true
    setLoading(true)
    setLoadingMore(false)
    void roomApi.getRoomHistory(code, participantToken).then((page) => {
      if (!active || generation !== requestGeneration.current) return
      setItems(page.items)
      setNextCursor(page.nextCursor)
      setError('')
    }).catch((cause: unknown) => {
      if (active && generation === requestGeneration.current) setError(getErrorMessage(cause, t))
    }).finally(() => {
      if (active && generation === requestGeneration.current) setLoading(false)
    })
    return () => { active = false; requestGeneration.current += 1 }
  }, [code, participantToken, revision, retry, t])

  async function loadMore() {
    if (!nextCursor || loadingMore) return
    const generation = requestGeneration.current
    setLoadingMore(true)
    try {
      const page = await roomApi.getRoomHistory(code, participantToken, nextCursor)
      if (generation !== requestGeneration.current) return
      setItems((current) => [...current, ...page.items.filter((entry) =>
        !current.some((existing) => existing.id === entry.id))])
      setNextCursor(page.nextCursor)
      setError('')
    } catch (cause) {
      if (generation === requestGeneration.current) setError(getErrorMessage(cause, t))
    } finally {
      if (generation === requestGeneration.current) setLoadingMore(false)
    }
  }

  async function addSong(videoId: string) {
    if (addingId) return
    setAddingId(videoId)
    try {
      await onAddSong(videoId)
    } finally {
      setAddingId('')
    }
  }

  return <section aria-label={t('history.title')} className="mx-auto w-full">
    {error && <div role="alert" className="mb-4 flex items-center gap-3 rounded-lg border border-danger/25 px-3 py-2 text-sm text-danger">
      <span>{error}</span>
      {items.length === 0 && <button type="button" className="ml-auto rounded-md p-1 text-purple-light hover:bg-white/10"
        aria-label={t('common.retry')} onClick={() => { setLoading(true); setRetry((value) => value + 1) }}>
        <RotateCw size={17} aria-hidden="true" />
      </button>}
    </div>}
    {loading && items.length === 0 ? <p role="status" className="text-sm text-muted">{t('library.loading')}</p>
      : items.length === 0 && !error ? <p className="rounded-xl border border-line bg-panel p-5 text-sm text-muted">{t('history.empty')}</p>
        : <>
          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            {items.map((entry) => <li key={entry.id}
              className="grid min-w-0 grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-lg border border-line bg-panel p-3 transition-colors duration-150 hover:border-purple/40 hover:bg-purple/15 focus-within:border-purple/40 focus-within:bg-purple/15 sm:grid-cols-[96px_minmax(0,1fr)_auto] sm:items-center">
              <img src={entry.thumbnailUrl} alt="" loading="lazy"
                className="row-span-2 aspect-video w-[88px] rounded-md bg-black object-cover sm:row-span-1 sm:w-24" />
              <div className="min-w-0">
                <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(entry.videoId)}`}
                  target="_blank" rel="noopener noreferrer" title={entry.title}
                  className="block truncate text-sm font-semibold text-ink hover:text-purple-light focus-visible:outline-2 focus-visible:outline-purple-light">
                  {entry.title}
                </a>
                <p className="mt-0.5 truncate text-xs text-muted" title={entry.artist}>{entry.artist}</p>
                <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="grid size-[18px] shrink-0 place-items-center overflow-hidden rounded-full border border-purple/25 bg-purple/[0.08] text-[10px] font-bold text-purple-light" aria-hidden="true">
                      {entry.requesterAvatarUrl ? <img src={entry.requesterAvatarUrl} alt="" className="size-full object-cover" />
                        : entry.requester.trim().slice(0, 1).toUpperCase()}
                    </span>
                  </span>
                  <span className="truncate">{entry.requester}</span>
                  <time dateTime={new Date(entry.startedAt).toISOString()} className="whitespace-nowrap">
                    {dateFormatter.format(new Date(entry.startedAt))}
                  </time>
                </div>
                {entry.startedAtEstimated && <p className="mt-1 text-[11px] text-muted">{t('history.estimated')}</p>}
              </div>
              <div className="col-start-2 flex shrink-0 items-center justify-end gap-1.5 sm:col-start-3 sm:row-start-1">
                <button type="button" aria-haspopup="dialog" onClick={() => setSaveSong(entry)}
                  aria-label={`${entry.title} · ${t(savedByVideoId[entry.videoId] ? 'library.savedInPlaylist' : 'library.addToPlaylist')}`}
                  title={t(savedByVideoId[entry.videoId] ? 'library.savedInPlaylist' : 'library.addToPlaylist')}
                  className="grid size-9 place-items-center rounded-lg border-0 bg-transparent p-0 text-muted transition-colors hover:bg-purple/10 hover:text-purple-light focus-visible:outline-2 focus-visible:outline-purple-light">
                  <PlaylistSaveIcon saved={Boolean(savedByVideoId[entry.videoId])} />
                </button>
                <AddToQueueButton label={t('queue.addSong', { title: entry.title })}
                  loading={addingId === entry.videoId} disabled={Boolean(addingId)}
                  onClick={() => { void addSong(entry.videoId) }} />
              </div>
            </li>)}
          </ol>
          {nextCursor && <button type="button" onClick={() => { void loadMore() }} disabled={loadingMore}
            className="mt-4 w-full rounded-lg border border-line bg-panel px-4 py-2.5 text-sm font-semibold text-purple-light transition-colors hover:bg-purple/10 focus-visible:outline-2 focus-visible:outline-purple-light disabled:opacity-50">
            {loadingMore ? t('library.loading') : t('history.more')}
          </button>}
        </>}
    {roomError && <p className="mt-3 text-sm text-danger" role="alert">{roomError}</p>}
    {message && !roomError && <p className="mt-3 text-sm text-lime" role="status">{message}</p>}
    {saveSong && <SaveToPlaylistDialog key={saveSong.id}
      song={{ videoId: saveSong.videoId, roomSongId: saveSong.id }}
      onClose={() => setSaveSong(null)}
      onSavedChange={(saved) => {
        if (!user) return
        setSavedMembership((previous) => ({
          userId: user.id,
          byVideoId: { ...(previous?.userId === user.id ? previous.byVideoId : {}), [saveSong.videoId]: saved },
        }))
      }}
      onLibraryChange={onLibraryChange} />}
  </section>
}
