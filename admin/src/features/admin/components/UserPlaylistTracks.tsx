import { useCallback, useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { adminApi } from '../api'
import { useAdminData } from '../hooks/useAdminData'
import type { UserPlaylist } from '../types'
import { formatDate } from '../../../shared/format'
import { DataState, Pagination } from './DataState'

export function UserPlaylistTracks({ userId, playlist }: { userId: string; playlist: UserPlaylist }) {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  useEffect(() => {
    const timer = window.setTimeout(() => { setQuery(search.trim()); setPage(1) }, 300)
    return () => window.clearTimeout(timer)
  }, [search])
  const loadTracks = useCallback((signal: AbortSignal) => adminApi.userPlaylistTracks(userId, playlist.id, query, page, signal), [userId, playlist.id, query, page])
  const { data, loading, error, reload } = useAdminData(loadTracks)
  const current = data?.playlist ?? playlist
  const name = current.kind === 'favorites' ? '즐겨찾기' : current.name
  return <Card className="min-w-0"><CardHeader><CardTitle className="break-words">{name}</CardTitle>
    <CardDescription className="space-y-1">
      <span className="block">{current.trackCount.toLocaleString('ko-KR')}곡 · 수정 {formatDate(current.updatedAt)}</span>
      <span className="block break-all font-mono text-xs">플레이리스트 ID {current.id}</span>
    </CardDescription></CardHeader><CardContent className="space-y-4">
    <label className="block"><span className="sr-only">플레이리스트 영상 제목, 아티스트 또는 영상 ID 검색</span>
      <Input placeholder="영상 제목, 아티스트 또는 영상 ID 검색" value={search} onChange={(event) => setSearch(event.target.value)} />
    </label>
    <DataState loading={loading} error={error} onRetry={reload}>
      {data && <>
        <ul className="divide-y">
          {data.items.map((track) => <li key={track.videoId} className="flex items-start justify-between gap-3 py-4">
            <div className="min-w-0 space-y-1">
              <p className="break-words font-medium">{track.title}</p>
              <p className="break-words text-xs text-muted-foreground">{track.artist}</p>
              <p className="break-all font-mono text-xs text-muted-foreground">{track.videoId}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{Math.floor(track.durationSeconds / 60)}:{String(track.durationSeconds % 60).padStart(2, '0')}</Badge>
                <span>저장 {formatDate(track.addedAt)}</span>
              </div>
            </div>
            <Button asChild variant="outline" size="icon-sm" className="shrink-0"><a
              href={`https://www.youtube.com/watch?v=${encodeURIComponent(track.videoId)}`} target="_blank" rel="noreferrer"
              aria-label={`${track.title} YouTube에서 열기`} title="YouTube에서 열기"><ExternalLink aria-hidden="true" /></a></Button>
          </li>)}
        </ul>
        {data.items.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{query ? '검색된 영상이 없습니다.' : '저장된 영상이 없습니다.'}</p>}
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />
      </>}
    </DataState>
  </CardContent></Card>
}
