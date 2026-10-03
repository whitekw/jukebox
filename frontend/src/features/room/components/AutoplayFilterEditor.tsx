import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Check, Music2, Plus, Search, X } from 'lucide-react'
import { getErrorMessage, useI18n } from '../../../shared/i18n/i18n-context'
import { buttonStyles, cn, formControlStyles } from '../../../shared/styles'
import { roomApi } from '../api'
import type { AutoplayHistoryVideo } from '../types'

export function AutoplayFilterEditor({ code, excludedWords, onWordsChange, excludedVideoIds,
  onVideoIdsChange, disabled, wordInput, wordInputId, wordError, onWordInputChange, onAddWord }: {
  code: string
  excludedWords: string[]
  onWordsChange: (words: string[]) => void
  excludedVideoIds: string[]
  onVideoIdsChange: (ids: string[]) => void
  disabled: boolean
  wordInput: string
  wordInputId: string
  wordError: string
  onWordInputChange: (value: string) => void
  onAddWord: () => void
}) {
  const { t, locale } = useI18n()
  const id = useId()
  const [searchInput, setSearchInput] = useState('')
  const [items, setItems] = useState<AutoplayHistoryVideo[]>([])
  const [metadata, setMetadata] = useState<Record<string, AutoplayHistoryVideo>>({})
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [searchError, setSearchError] = useState('')
  const requestGeneration = useRef(0)

  useEffect(() => {
    const generation = ++requestGeneration.current
    let active = true
    setLoading(true)
    setLoadingMore(false)
    setSearchError('')
    setItems([])
    setNextOffset(null)
    const timer = window.setTimeout(() => {
      void roomApi.getAutoplayHistoryVideos(code, searchInput.trim()).then((page) => {
        if (!active || generation !== requestGeneration.current) return
        setItems(page.items)
        setNextOffset(page.nextOffset)
        setMetadata((previous) => {
          const updated = { ...previous }
          for (const video of [...page.excludedVideos, ...page.items]) updated[video.videoId] = video
          return updated
        })
      }).catch((cause: unknown) => {
        if (active && generation === requestGeneration.current) setSearchError(getErrorMessage(cause, t))
      }).finally(() => {
        if (active && generation === requestGeneration.current) setLoading(false)
      })
    }, searchInput ? 250 : 0)
    return () => {
      active = false
      window.clearTimeout(timer)
      requestGeneration.current += 1
    }
  }, [code, searchInput, t])

  async function loadMore() {
    if (nextOffset === null || loadingMore) return
    const generation = requestGeneration.current
    setLoadingMore(true)
    setSearchError('')
    try {
      const page = await roomApi.getAutoplayHistoryVideos(code, searchInput.trim(), nextOffset)
      if (generation !== requestGeneration.current) return
      setItems((current) => [...current, ...page.items])
      setNextOffset(page.nextOffset)
      setMetadata((previous) => {
        const updated = { ...previous }
        for (const video of page.items) updated[video.videoId] = video
        return updated
      })
    } catch (cause) {
      if (generation === requestGeneration.current) setSearchError(getErrorMessage(cause, t))
    } finally {
      if (generation === requestGeneration.current) setLoadingMore(false)
    }
  }

  function onWordKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    if (!event.nativeEvent.isComposing) onAddWord()
  }

  function toggleVideo(videoId: string) {
    if (excludedVideoIds.includes(videoId)) {
      onVideoIdsChange(excludedVideoIds.filter((id) => id !== videoId))
    } else if (excludedVideoIds.length < 100) {
      onVideoIdsChange([...excludedVideoIds, videoId])
    }
  }

  return <div className="mt-4 grid items-start gap-4 @[44rem]/settings:grid-cols-[minmax(240px,0.8fr)_minmax(0,1.2fr)]">
    <section className="min-w-0 rounded-xl border border-line bg-panel p-4 @[36rem]/settings:p-5">
      <label className="block text-sm font-semibold" htmlFor={wordInputId}>{t('roomSettings.excludedWords')}</label>
      <p className="mt-1 text-xs leading-5 text-muted">{t('roomSettings.excludedWordsHint')}</p>
      <div className="mt-3 flex min-w-0 gap-2">
        <input id={wordInputId} className={cn(formControlStyles({ size: 'default' }), 'min-w-0', wordError && 'border-danger')}
          value={wordInput} onChange={(event) => onWordInputChange(event.target.value)}
          aria-invalid={Boolean(wordError)} aria-describedby={wordError ? `${id}-word-error` : undefined}
          onKeyDown={onWordKeyDown} maxLength={81} disabled={disabled}
          placeholder={t('roomSettings.excludedWordsPlaceholder')} />
        <button type="button" className={cn(buttonStyles({ intent: 'outline', size: 'sm' }), 'shrink-0')}
          onClick={onAddWord} disabled={disabled || !wordInput.trim()}>
          <Plus size={15} aria-hidden="true" />{t('roomSettings.addWord')}
        </button>
      </div>
      {wordError && <p id={`${id}-word-error`} className="mt-2 text-xs text-danger" role="alert">{wordError}</p>}
      {excludedWords.length === 0 ? <p className="mt-3 text-xs text-muted">{t('roomSettings.noWords')}</p>
        : <ul className="mt-3 flex flex-wrap gap-2" aria-label={t('roomSettings.excludedWords')}>
          {excludedWords.map((word) => <li key={word}
            className="inline-flex min-w-0 items-center gap-1 rounded-lg border border-purple/25 bg-purple/10 py-1 pl-2.5 pr-1 text-xs text-purple-light">
            <span className="max-w-48 truncate" title={word}>{word}</span>
            <button type="button" className="grid size-6 shrink-0 place-items-center rounded-md hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-purple-light"
              aria-label={t('roomSettings.removeWord', { word })} onClick={() => onWordsChange(excludedWords.filter((item) => item !== word))}
              disabled={disabled}><X size={14} aria-hidden="true" /></button>
          </li>)}</ul>}
    </section>

    <section className="min-w-0 rounded-xl border border-line bg-panel p-4 @[36rem]/settings:p-5">
      <h4 className="text-sm font-semibold">{t('roomSettings.excludedVideos')}</h4>
      <p className="mt-1 text-xs leading-5 text-muted">{t('roomSettings.excludedVideosHint')}</p>
      {excludedVideoIds.length > 0 && <div className="mt-4">
        <p className="mb-2 text-xs font-semibold text-purple-light">{t('roomSettings.selectedVideos', { count: excludedVideoIds.length })}</p>
        <ul className="max-h-48 space-y-2 overflow-y-auto overscroll-contain [scrollbar-width:thin]">
          {excludedVideoIds.map((videoId) => {
            const video = metadata[videoId]
            return <li key={videoId} className="flex min-w-0 items-center gap-3 rounded-lg border border-purple/25 bg-purple/10 p-2">
              {video?.thumbnailUrl ? <img src={video.thumbnailUrl} alt="" className="h-10 w-[60px] shrink-0 rounded object-cover" />
                : <span className="grid h-10 w-[60px] shrink-0 place-items-center rounded bg-white/5 text-muted"><Music2 size={17} /></span>}
              <span className="min-w-0 flex-1 truncate text-xs font-semibold" title={video?.title ?? videoId}>{video?.title ?? videoId}</span>
              <button type="button" className="grid size-8 shrink-0 place-items-center rounded-md text-muted hover:bg-white/10 hover:text-ink focus-visible:outline-2 focus-visible:outline-purple-light"
                aria-label={t('roomSettings.restoreVideo', { title: video?.title ?? videoId })}
                onClick={() => toggleVideo(videoId)} disabled={disabled}><X size={16} aria-hidden="true" /></button>
            </li>
          })}
        </ul>
      </div>}
      <label className="mt-4 block text-xs font-semibold" htmlFor={`${id}-video-search`}>{t('roomSettings.searchHistory')}</label>
      <div className="relative mt-2">
        <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input id={`${id}-video-search`} className={cn(formControlStyles({ size: 'default' }), 'pl-9')}
          type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') event.preventDefault() }}
          placeholder={t('roomSettings.searchHistoryPlaceholder')} disabled={disabled} />
      </div>
      <p className="mt-2 text-xs text-muted">{t('roomSettings.historyOrder')}</p>
      {searchError && <p className="mt-3 text-xs text-danger" role="alert">{searchError}</p>}
      {loading ? <p className="mt-4 text-sm text-muted" role="status">{t('library.loading')}</p>
        : items.length === 0 ? <p className="mt-4 rounded-lg border border-line p-4 text-sm text-muted">
          {t(searchInput ? 'roomSettings.noSearchResults' : 'roomSettings.noHistoryVideos')}
        </p> : <ul className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line">
          {items.map((video) => {
            const selected = excludedVideoIds.includes(video.videoId)
            return <li key={video.videoId} className="flex min-w-0 items-center gap-3 bg-canvas/40 p-2.5 transition-colors hover:bg-white/[0.04]">
              <img src={video.thumbnailUrl} alt="" className="h-12 w-[72px] shrink-0 rounded object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold" title={video.title}>{video.title}</p>
                <p className="mt-1 truncate text-[11px] text-muted">{video.artist} · {Math.floor(video.durationSeconds / 60)}:{String(video.durationSeconds % 60).padStart(2, '0')} · {new Date(video.startedAt).toLocaleDateString(locale)}</p>
              </div>
              <button type="button" className={cn('inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-purple-light',
                selected ? 'text-lime hover:bg-lime/10' : 'text-purple-light hover:bg-purple/10')}
                aria-label={t(selected ? 'roomSettings.restoreVideo' : 'roomSettings.excludeVideo', { title: video.title })}
                aria-pressed={selected} disabled={disabled || (!selected && excludedVideoIds.length >= 100)}
                onClick={() => toggleVideo(video.videoId)}>
                {selected ? <Check size={15} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}
                <span className="hidden @[36rem]/settings:inline">{t(selected ? 'roomSettings.includedAction' : 'roomSettings.excludeAction')}</span>
              </button>
            </li>
          })}
        </ul>}
      {nextOffset !== null && !loading && <button type="button"
        className={cn(buttonStyles({ intent: 'outline', size: 'sm' }), 'mt-3 w-full')}
        onClick={() => void loadMore()} disabled={disabled || loadingMore}>
        {loadingMore ? t('library.loading') : t('roomSettings.loadMore')}
      </button>}
    </section>
  </div>
}
