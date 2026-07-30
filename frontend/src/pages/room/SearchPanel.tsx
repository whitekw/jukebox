import { useState, type FormEvent } from 'react'
import { api } from '../../api'
import { SearchIcon } from '../../components/Icons'
import { formatDuration } from '../../format'
import type { VideoSearchResult } from '../../types'

type SearchPanelProps = {
  songsLeft: number
  onAddSong: (videoId: string) => Promise<void>
}

export function SearchPanel({ songsLeft, onAddSong }: SearchPanelProps) {
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
      if (response.items.length === 0) setSearchError('검색 결과가 없습니다.')
    } catch (requestError) {
      setSearchError((requestError as Error).message)
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
    <section className="search-panel">
      <div className="guest-section-heading">
        <div>
          <span className="section-kicker">REQUEST A SONG</span>
          <h2>어떤 곡을 들을까요?</h2>
        </div>
        <span className={`songs-left ${songsLeft === 0 ? 'exhausted' : ''}`}>
          {songsLeft}곡 추가 가능
        </span>
      </div>
      <form className="search-form" onSubmit={search}>
        <SearchIcon size={21} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="곡, 아티스트 또는 YouTube URL"
          minLength={2}
          required
        />
        <button type="submit" disabled={searching}>
          {searching ? '검색 중…' : '검색'}
        </button>
      </form>
      <p className="search-hint">YouTube, YouTube Music, youtu.be 주소를 바로 붙여넣을 수 있습니다.</p>
      {searchError && <p className="panel-error" role="alert">{searchError}</p>}

      {results.length > 0 && (
        <ul className="search-results">
          {results.map((video) => (
            <li key={video.videoId}>
              <img src={video.thumbnailUrl} alt="" />
              <div>
                <strong>{video.title}</strong>
                <span>{video.artist}</span>
              </div>
              <span className="result-duration">{formatDuration(video.durationSeconds)}</span>
              <button
                type="button"
                aria-label={`${video.title} 추가`}
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
