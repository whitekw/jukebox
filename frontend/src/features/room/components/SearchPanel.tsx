import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Search as SearchIcon } from 'lucide-react'
import { roomApi } from '../api'
import { getErrorMessage, useI18n } from '../../../shared/i18n/i18n-context'
import { buttonStyles, cn } from '../../../shared/styles'
import type { VideoSearchResult } from '../types'
import { VideoResultList } from './VideoResultList'

type SearchPanelProps = {
  onAddSong: (videoId: string) => Promise<void>
  className?: string
}

export function SearchPanel({ onAddSong, className }: SearchPanelProps) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<VideoSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [addingId, setAddingId] = useState('')
  const [searchError, setSearchError] = useState<unknown>(null)
  const [searchEmpty, setSearchEmpty] = useState(false)
  const mounted = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (searching) return
    setSearching(true)
    setSearchError(null)
    setSearchEmpty(false)
    setResults([])
    try {
      const response = await roomApi.searchVideos(query)
      if (!mounted.current) return
      setResults(response.items)
      setSearchEmpty(response.items.length === 0)
    } catch (requestError) {
      if (!mounted.current) return
      setSearchError(requestError)
    } finally {
      if (mounted.current) setSearching(false)
    }
  }

  async function addSong(videoId: string) {
    if (addingId) return
    setAddingId(videoId)
    try {
      await onAddSong(videoId)
    } finally {
      if (mounted.current) setAddingId('')
    }
  }

  return (
    <section className={cn('flex min-w-0 flex-col', className)}>
      <form
        className="flex shrink-0 items-center gap-2.5 rounded-xl border border-line bg-white/[0.035] py-1.5 pr-[7px] pl-3.5 text-dim focus-within:border-purple/65"
        onSubmit={search}
      >
        <input
          id="room-song-search"
          aria-label={t('search.placeholder')}
          className="h-[42px] min-w-0 flex-1 border-0 bg-transparent p-0 text-ink outline-none placeholder:text-white/20"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('search.placeholder')}
          minLength={2}
          required
        />
        <button
          className={cn(
            buttonStyles({ intent: 'primary', size: 'sm' }),
            'size-11 min-h-11 shrink-0 rounded-lg px-0',
          )}
          type="submit"
          disabled={searching}
          aria-label={searching ? t('search.searching') : t('search.button')}
        >
          <SearchIcon size={20} />
        </button>
      </form>
      <p className="mx-[3px] mt-2 shrink-0 text-[10px] text-dim">
        {t('search.urlHint')}
      </p>
      {(searchError !== null || searchEmpty) && (
        <p className="mx-[3px] mt-[18px] text-xs text-[#ff9cab]" role="alert">
          {searchEmpty ? t('search.noResults') : getErrorMessage(searchError, t)}
        </p>
      )}
      {searching && (
        <p className="mt-[18px] text-center text-xs text-muted" role="status">
          {t('search.searching')}
        </p>
      )}
      {!searching && results.length > 0 && (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <VideoResultList
            videos={results}
            addingId={addingId}
            onAddSong={(videoId) => void addSong(videoId)}
          />
        </div>
      )}
    </section>
  )
}
