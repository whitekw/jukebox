import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { api } from '../../api'
import { SearchIcon } from '../../components/Icons'
import { getErrorMessage, useI18n } from '../../i18n-context'
import {
  buttonStyles,
  cn,
  panelStyles,
  sectionKickerStyles,
} from '../../styles'
import type { VideoSearchResult } from '../../types'
import { VideoResultList } from './VideoResultList'

type SearchPanelProps = {
  onAddSong: (videoId: string) => Promise<void>
}

export function SearchPanel({ onAddSong }: SearchPanelProps) {
  const { locale, t } = useI18n()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<VideoSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [addingId, setAddingId] = useState('')
  const [searchError, setSearchError] = useState<unknown>(null)
  const [searchEmpty, setSearchEmpty] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [activeView, setActiveView] = useState<'popular' | 'search'>('popular')
  const [popularResults, setPopularResults] = useState<VideoSearchResult[]>([])
  const [popularRegion, setPopularRegion] = useState('KR')
  const [popularLoading, setPopularLoading] = useState(true)
  const [popularError, setPopularError] = useState<unknown>(null)
  const popularRequestId = useRef(0)

  const loadPopularMusic = useCallback(async () => {
    const requestId = ++popularRequestId.current
    setPopularLoading(true)
    setPopularError(null)
    try {
      const response = await api.getPopularMusic()
      if (requestId !== popularRequestId.current) return
      setPopularResults(response.items)
      setPopularRegion(response.regionCode)
    } catch (requestError) {
      if (requestId === popularRequestId.current) setPopularError(requestError)
    } finally {
      if (requestId === popularRequestId.current) setPopularLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPopularMusic()
    return () => {
      popularRequestId.current += 1
    }
  }, [loadPopularMusic])

  const popularRegionName = useMemo(() => {
    try {
      return (
        new Intl.DisplayNames([locale], { type: 'region' }).of(popularRegion) ??
        popularRegion
      )
    } catch {
      return popularRegion
    }
  }, [locale, popularRegion])

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (searching) return
    setActiveView('search')
    setHasSearched(true)
    setSearching(true)
    setSearchError(null)
    setSearchEmpty(false)
    setResults([])
    try {
      const response = await api.searchVideos(query)
      setResults(response.items)
      setSearchEmpty(response.items.length === 0)
    } catch (requestError) {
      setSearchError(requestError)
    } finally {
      setSearching(false)
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

  return (
    <section className={panelStyles({ padding: 'responsive' })}>
      <div className="mx-1 mb-[18px] md:mx-[7px]">
        <div>
          <span className={sectionKickerStyles}>REQUEST A SONG</span>
          <h2 className="mt-1.5 text-xl tracking-[-0.03em] md:text-[23px]">
            {t('search.title')}
          </h2>
        </div>
      </div>
      <form
        className="flex items-center gap-2.5 rounded-xl border border-line bg-white/[0.035] py-1.5 pr-[7px] pl-2.5 text-dim focus-within:border-purple/65 md:pl-3.5"
        onSubmit={search}
      >
        <SearchIcon size={21} />
        <input
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
            'h-[38px] min-h-[38px] rounded-lg px-3 font-[850] md:px-[17px]',
          )}
          type="submit"
          disabled={searching}
        >
          {searching ? t('search.searching') : t('search.button')}
        </button>
      </form>
      <p className="mx-[3px] mt-2 text-[10px] text-[#67616f]">
        {t('search.urlHint')}
      </p>
      <div
        className="mt-[18px] flex gap-1 border-b border-line"
        role="tablist"
        aria-label={t('search.browseMode')}
      >
        <button
          className={cn(
            '-mb-px border-b-2 px-3 py-2 text-xs font-extrabold transition-colors',
            activeView === 'popular'
              ? 'border-lime text-lime'
              : 'border-transparent text-muted hover:text-ink',
          )}
          type="button"
          role="tab"
          aria-selected={activeView === 'popular'}
          onClick={() => setActiveView('popular')}
        >
          {t('search.popularTab')}
        </button>
        <button
          className={cn(
            '-mb-px border-b-2 px-3 py-2 text-xs font-extrabold transition-colors',
            activeView === 'search'
              ? 'border-purple-light text-purple-light'
              : 'border-transparent text-muted hover:text-ink',
            'disabled:cursor-not-allowed disabled:opacity-40',
          )}
          type="button"
          role="tab"
          aria-selected={activeView === 'search'}
          disabled={!hasSearched}
          onClick={() => setActiveView('search')}
        >
          {t('search.resultsTab')}
        </button>
      </div>

      {activeView === 'popular' && (
        <div role="tabpanel">
          <div className="mx-1 mt-[18px]">
            <span className={sectionKickerStyles}>YOUTUBE CHART</span>
            <h3 className="mt-1 text-base tracking-[-0.02em]">
              {t('search.popularHeading', { region: popularRegionName })}
            </h3>
          </div>
          {popularLoading && (
            <p
              className="mt-[18px] animate-pulse rounded-[10px] bg-white/[0.035] px-4 py-6 text-center text-xs text-muted"
              role="status"
            >
              {t('search.popularLoading')}
            </p>
          )}
          {!popularLoading && popularError !== null && (
            <div className="mt-[18px] flex items-center justify-between gap-3 rounded-[10px] border border-danger/25 bg-danger/[0.06] p-3">
              <p className="m-0 text-xs text-[#ff9cab]" role="alert">
                {getErrorMessage(popularError, t)}
              </p>
              <button
                className={buttonStyles({ intent: 'outline', size: 'sm' })}
                type="button"
                onClick={() => void loadPopularMusic()}
              >
                {t('common.retry')}
              </button>
            </div>
          )}
          {!popularLoading && popularError === null && popularResults.length === 0 && (
            <p className="mt-[18px] text-center text-xs text-muted">
              {t('search.popularEmpty')}
            </p>
          )}
          {!popularLoading && popularResults.length > 0 && (
            <VideoResultList
              videos={popularResults}
              addingId={addingId}
              ranked
              onAddSong={(videoId) => void addSong(videoId)}
            />
          )}
        </div>
      )}

      {activeView === 'search' && (
        <div role="tabpanel">
          {(searchError !== null || searchEmpty) && (
            <p className="mx-[3px] mt-[18px] text-xs text-[#ff9cab]" role="alert">
              {searchEmpty
                ? t('search.noResults')
                : getErrorMessage(searchError, t)}
            </p>
          )}
          {searching && (
            <p className="mt-[18px] text-center text-xs text-muted" role="status">
              {t('search.searching')}
            </p>
          )}
          {!searching && results.length > 0 && (
            <VideoResultList
              videos={results}
              addingId={addingId}
              onAddSong={(videoId) => void addSong(videoId)}
            />
          )}
        </div>
      )}
    </section>
  )
}
