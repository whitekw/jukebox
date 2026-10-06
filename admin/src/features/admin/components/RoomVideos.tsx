import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { adminApi } from '../api'
import { useAdminData } from '../hooks/useAdminData'
import { DataState, Pagination } from './DataState'

export function RoomVideos({ code, onDeleteRecords }: { code: string; onDeleteRecords: (videoId: string) => void }) {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  useEffect(() => {
    const timer = window.setTimeout(() => { setQuery(search.trim()); setPage(1) }, 300)
    return () => window.clearTimeout(timer)
  }, [search])
  const loadVideos = useCallback((signal: AbortSignal) => adminApi.roomVideos(code, query, page, signal), [code, query, page])
  const { data, loading, error, reload } = useAdminData(loadVideos)
  return <Card><CardHeader><CardTitle>영상별 기록 관리</CardTitle>
    <CardDescription>같은 영상의 신청·재생 건을 하나로 묶었습니다. 기록 삭제는 신청자와 관계없이 이 방의 해당 영상 전체에 적용됩니다.</CardDescription>
  </CardHeader><CardContent className="space-y-4">
    <label className="block space-y-2"><span className="sr-only">영상 제목, 아티스트 또는 영상 ID 검색</span>
      <Input placeholder="영상 제목, 아티스트 또는 영상 ID 검색" value={search} onChange={(event) => setSearch(event.target.value)} />
    </label>
    <DataState loading={loading} error={error} onRetry={reload}>
      {data && <>
        <div className="max-h-96 overflow-auto"><Table><TableHeader><TableRow>
          <TableHead>영상</TableHead><TableHead>신청·자동 재생</TableHead><TableHead>재생 횟수</TableHead><TableHead>상태</TableHead><TableHead><span className="sr-only">기록 관리</span></TableHead>
        </TableRow></TableHeader><TableBody>{data.items.map((video) => <TableRow key={video.videoId}>
          <TableCell><p className="max-w-72 truncate font-medium" title={video.title}>{video.title}</p>
            <p className="text-xs text-muted-foreground">{video.artist}</p><p className="font-mono text-xs text-muted-foreground">{video.videoId}</p></TableCell>
          <TableCell className="tabular-nums">{video.songs}건</TableCell><TableCell className="tabular-nums">{video.plays}건</TableCell>
          <TableCell><div className="flex flex-wrap gap-1">
            {video.currentSongs > 0 && <Badge variant="secondary">현재 재생</Badge>}
            {video.queuedSongs > 0 && <Badge variant="outline">대기 {video.queuedSongs}건</Badge>}
            {video.failedSongs > 0 && <Badge variant="outline">재생 실패</Badge>}
            {video.autoplayExcluded && <Badge variant="outline">자동 재생 제외</Badge>}
          </div></TableCell>
          <TableCell><Button variant="outline" size="sm" aria-label={`${video.title} 영상의 이 방 기록 삭제`}
            onClick={() => onDeleteRecords(video.videoId)}>영상 기록 삭제</Button></TableCell>
        </TableRow>)}
          {data.items.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">영상 기록이 없습니다.</TableCell></TableRow>}
        </TableBody></Table></div>
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />
      </>}
    </DataState>
  </CardContent></Card>
}
