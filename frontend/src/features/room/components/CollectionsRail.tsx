import { useEffect, useState, type Ref } from 'react'
import { Heart, ListMusic, RotateCw } from 'lucide-react'
import { useAuth } from '../../auth/context'
import { libraryApi, type Playlist } from '../../library/api'
import { useI18n } from '../../../shared/i18n/i18n-context'
import { cn, panelStyles } from '../../../shared/styles'

export function CollectionsRail({ chatTriggerRef, libraryRevision = 0, selectedPlaylistId, onSelectPlaylist }: {
  chatTriggerRef?: Ref<HTMLDivElement>
  libraryRevision?: number
  selectedPlaylistId: string | null
  onSelectPlaylist: (playlist: Playlist) => void
}) {
  const { t } = useI18n()
  const { user } = useAuth()
  const userId = user?.id
  const [loaded, setLoaded] = useState<{ userId: string; items: Playlist[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  const playlists = loaded && loaded.userId === userId ? loaded.items : []

  useEffect(() => {
    if (!userId) return
    const ownerId = userId
    let active = true
    let requestSequence = 0
    function load() {
      const requestId = ++requestSequence
      setLoading(true)
      void libraryApi.list().then(({ items }) => {
        if (!active || requestId !== requestSequence) return
        setLoaded({ userId: ownerId, items })
        setError(false)
      }).catch(() => {
        if (active && requestId === requestSequence) setError(true)
      }).finally(() => {
        if (active && requestId === requestSequence) setLoading(false)
      })
    }
    load()
    window.addEventListener('focus', load)
    return () => {
      active = false
      window.removeEventListener('focus', load)
    }
  }, [userId, libraryRevision, retry])

  return (
    <aside
      className={cn(
        panelStyles({ padding: 'none' }),
        'hidden min-h-0 w-[72px] flex-col items-center overflow-hidden py-3 lg:flex lg:rounded-none lg:border-y-0 lg:border-l-0 lg:bg-panel',
      )}
      aria-label={t('collection.railTitle')}
    >
      <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-2 overflow-y-auto overscroll-contain px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {playlists.map((playlist) => {
          const name = playlist.kind === 'favorites' ? t('collection.favorites') : playlist.name
          return (
            <button
              key={playlist.id}
              type="button"
              className={cn(
                'grid size-11 shrink-0 place-items-center overflow-hidden rounded-[4px] border border-transparent bg-white/5 text-purple-light transition-colors hover:border-purple-light/60 hover:bg-purple/15 focus-visible:outline-2 focus-visible:outline-purple-light',
                selectedPlaylistId === playlist.id && 'border-purple-light bg-purple/20',
              )}
              aria-label={`${name} · ${t('library.trackCount', { count: playlist.trackCount })}`}
              title={`${name} · ${t('library.trackCount', { count: playlist.trackCount })}`}
              onClick={() => onSelectPlaylist(playlist)}
            >
              {playlist.kind === 'favorites'
                ? <span className="grid size-full place-items-center bg-gradient-to-br from-purple to-[#9de0cf] text-white"><Heart size={23} fill="currentColor" aria-hidden="true" /></span>
                : playlist.thumbnailUrl
                  ? <img className="size-full object-cover" src={playlist.thumbnailUrl} alt="" />
                  : <ListMusic size={21} aria-hidden="true" />}
            </button>
          )
        })}
        {userId && loading && playlists.length === 0 && <span className="size-11 shrink-0 animate-pulse rounded-[4px] bg-white/5" aria-label={t('library.loading')} />}
        {userId && error && playlists.length === 0 && (
          <button type="button" className="grid size-11 shrink-0 place-items-center rounded-[4px] border border-line text-muted hover:text-ink" aria-label={t('common.retry')} title={t('common.retry')} onClick={() => setRetry((value) => value + 1)}>
            <RotateCw size={20} aria-hidden="true" />
          </button>
        )}
      </div>
      {chatTriggerRef && (
        <div className="mt-auto flex w-full shrink-0 justify-center border-t border-line pt-3" ref={chatTriggerRef} />
      )}
    </aside>
  )
}
