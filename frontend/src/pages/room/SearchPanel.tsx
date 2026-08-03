import { useState, type FormEvent } from 'react'
import { api } from '../../api'
import { SearchIcon } from '../../components/Icons'
import { formatDuration } from '../../format'
import { getErrorMessage, useI18n } from '../../i18n-context'
import {
  buttonStyles,
  cn,
  panelStyles,
  sectionKickerStyles,
} from '../../styles'
import type { VideoSearchResult } from '../../types'

type SearchPanelProps = {
  songsLeft: number
  onAddSong: (videoId: string) => Promise<void>
}

export function SearchPanel({ songsLeft, onAddSong }: SearchPanelProps) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<VideoSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [addingId, setAddingId] = useState('')
  const [searchError, setSearchError] = useState('')

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (searching) return
    setSearching(true)
    setSearchError('')
    try {
      const response = await api.searchVideos(query)
      setResults(response.items)
      if (response.items.length === 0) setSearchError(t('search.noResults'))
    } catch (requestError) {
      setSearchError(getErrorMessage(requestError, t))
    } finally {
      setSearching(false)
    }
  }

  async function addSong(videoId: string) {
    if (addingId || songsLeft <= 0) return
    setAddingId(videoId)
    try {
      await onAddSong(videoId)
    } finally {
      setAddingId('')
    }
  }

  return (
    <section className={panelStyles({ padding: 'responsive' })}>
      <div className="mx-1 mb-[18px] flex items-end justify-between gap-3 md:mx-[7px]">
        <div>
          <span className={sectionKickerStyles}>REQUEST A SONG</span>
          <h2 className="mt-1.5 text-xl tracking-[-0.03em] md:text-[23px]">
            {t('search.title')}
          </h2>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full border px-2.5 py-[7px] text-[11px]',
            songsLeft === 0
              ? 'border-line bg-transparent text-dim'
              : 'border-lime/20 bg-lime/[0.05] text-lime',
          )}
        >
          {t('search.songsAvailable', { count: songsLeft })}
        </span>
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
      {searchError && (
        <p className="mx-[3px] mt-3 text-xs text-[#ff9cab]" role="alert">
          {searchError}
        </p>
      )}

      {results.length > 0 && (
        <ul className="mt-[18px] flex min-w-0 list-none flex-col gap-1.5 p-0">
          {results.map((video) => (
            <li
              className={cn(
                'grid min-w-0 grid-cols-[minmax(0,1fr)_36px] gap-x-3 gap-y-2 overflow-hidden',
                'rounded-[10px] bg-white/[0.035] p-3',
                'md:flex md:items-center md:gap-[11px] md:p-2',
              )}
              key={video.videoId}
            >
              <img
                className="col-start-1 row-start-1 aspect-video w-24 shrink-0 rounded-[7px] object-cover md:w-[76px]"
                src={video.thumbnailUrl}
                alt=""
              />
              <div className="col-span-2 row-start-2 flex min-w-0 flex-1 flex-col md:col-span-1 md:row-auto">
                <strong
                  className="line-clamp-2 max-w-full text-[13px] leading-[1.45] md:block md:overflow-hidden md:text-ellipsis md:whitespace-nowrap"
                  title={video.title}
                >
                  {video.title}
                </strong>
                <span
                  className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-muted"
                  title={video.artist}
                >
                  {video.artist}
                </span>
              </div>
              <span className="hidden font-mono text-[10px] text-dim md:inline">
                {formatDuration(video.durationSeconds)}
              </span>
              <button
                className="col-start-2 row-start-1 grid size-9 shrink-0 place-items-center justify-self-end rounded-[9px] border border-lime/25 bg-lime/[0.05] text-[22px] text-lime disabled:cursor-not-allowed disabled:opacity-45 md:col-auto md:row-auto"
                type="button"
                aria-label={t('search.addSong', { title: video.title })}
                disabled={songsLeft <= 0 || Boolean(addingId)}
                onClick={() => void addSong(video.videoId)}
              >
                {addingId === video.videoId ? '…' : '+'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
