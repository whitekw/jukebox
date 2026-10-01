import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DataState, PageHeading, Pagination } from '../components/DataState'
import { useAdminData } from '../hooks/useAdminData'
import type { Page, RoomSummary } from '../types'
import { formatDate } from '../../../shared/format'

export function RoomsPage() {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  useEffect(() => {
    const timer = window.setTimeout(() => { setQuery(search.trim()); setPage(1) }, 300)
    return () => window.clearTimeout(timer)
  }, [search])
  const { data, error, loading, reload } = useAdminData<Page<RoomSummary>>(
    `/api/admin/rooms?query=${encodeURIComponent(query)}&page=${page}`,
  )

  return <>
    <PageHeading title="방 관리" description="현재 방의 재생 상태, 대기열과 접속 인원을 확인합니다." />
    <Card>
      <CardHeader><CardTitle>방 목록</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <label className="relative block max-w-sm">
          <span className="sr-only">방 코드, 이름 또는 소유자 검색</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)}
            placeholder="방 코드, 이름 또는 소유자" className="pl-9" />
        </label>
        <DataState loading={loading} error={error} onRetry={reload}>
          {data && <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>방</TableHead><TableHead>소유자</TableHead><TableHead>재생</TableHead>
                  <TableHead className="text-right">온라인</TableHead><TableHead className="text-right">대기열</TableHead>
                  <TableHead>생성</TableHead><TableHead><span className="sr-only">자세히</span></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {data.items.map((room) => <TableRow key={room.code}>
                    <TableCell className="max-w-56"><div className="truncate font-medium" title={room.title}>{room.title}</div>
                      <div className="font-mono text-xs text-muted-foreground">{room.code}</div></TableCell>
                    <TableCell>{room.ownerName ?? '—'}</TableCell>
                    <TableCell><Badge variant={room.playbackPaused ? 'outline' : 'secondary'}>
                      {room.playbackPaused ? '일시정지' : room.currentTitle ? '재생 중' : '대기 중'}
                    </Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{room.onlineParticipants}</TableCell>
                    <TableCell className="text-right tabular-nums">{room.queueCount}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(room.createdAt)}</TableCell>
                    <TableCell><Button asChild size="sm" variant="ghost"><Link to={`/rooms/${room.code}`}>상세</Link></Button></TableCell>
                  </TableRow>)}
                  {data.items.length === 0 && <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">검색된 방이 없습니다.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />
          </>}
        </DataState>
      </CardContent>
    </Card>
  </>
}
