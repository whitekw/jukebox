import { useState, type FormEvent } from 'react'
import { roomApi } from '../api'
import { SearchIcon } from '../../../shared/ui/Icons'
import { getErrorMessage, useI18n } from '../../../shared/i18n/i18n-context'
import {
  buttonStyles,
  cn,
  panelStyles,
  sectionKickerStyles,
} from '../../../shared/styles'
import type { VideoSearchResult } from '../types'
import { VideoResultList } from './VideoResultList'

type SearchPanelProps = {
  onAddSong: (videoId: string) => Promise<void>
}

export function SearchPanel({ onAddSong }: SearchPanelProps) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<VideoSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [addingId, setAddingId] = useState('')
  const [searchError, setSearchError] = useState<unknown>(null)
  const [searchEmpty, setSearchEmpty] = useState(false)

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (searching) return
    setSearching(true)
    setSearchError(null)
    setSearchEmpty(false)
    setResults([])
    try {
      const response = await roomApi.searchVideos(query)
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
        <VideoResultList
          videos={results}
          addingId={addingId}
          onAddSong={(videoId) => void addSong(videoId)}
        />
      )}
    </section>
  )
}
