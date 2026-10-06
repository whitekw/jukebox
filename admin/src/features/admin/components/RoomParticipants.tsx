import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { adminApi } from '../api'
import { useAdminData } from '../hooks/useAdminData'
import { DataState, Pagination } from './DataState'

export function RoomParticipants({ code, onDeleteRecords }: { code: string; onDeleteRecords: (participantId: string) => void }) {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  useEffect(() => {
    const timer = window.setTimeout(() => { setQuery(search.trim()); setPage(1) }, 300)
    return () => window.clearTimeout(timer)
  }, [search])
  const loadParticipants = useCallback((signal: AbortSignal) => adminApi.roomParticipants(code, query, page, signal), [code, query, page])
  const { data, loading, error, reload } = useAdminData(loadParticipants)
  return <Card><CardHeader><CardTitle>참여자·참여 이력</CardTitle>
    <CardDescription>퇴장한 이력도 검색할 수 있습니다. 로그인 계정의 기록 삭제는 이 방의 재입장 이력 전체에 적용됩니다.</CardDescription>
  </CardHeader><CardContent className="space-y-4">
    <label className="block space-y-2"><span className="sr-only">참여자 이름, Discord ID 또는 참여 ID 검색</span>
      <Input placeholder="이름 또는 Discord ID 검색" value={search} onChange={(event) => setSearch(event.target.value)} />
    </label>
    <DataState loading={loading} error={error} onRetry={reload}>
      {data && <>
        <div className="max-h-96 overflow-auto"><Table><TableHeader><TableRow>
          <TableHead>이름</TableHead><TableHead>유형</TableHead><TableHead>상태</TableHead><TableHead><span className="sr-only">기록 관리</span></TableHead>
        </TableRow></TableHeader><TableBody>{data.items.map((participant) => <TableRow key={participant.id}>
          <TableCell><p>{participant.nickname}</p><p className="font-mono text-xs text-muted-foreground">{participant.discordId ?? participant.id}</p></TableCell>
          <TableCell className="whitespace-nowrap">{participant.isManager ? '방 관리자' : participant.isMember ? '로그인' : '비로그인'}</TableCell>
          <TableCell><Badge variant={participant.online ? 'secondary' : 'outline'}>{participant.online ? '온라인' : participant.leftAt !== null ? '퇴장' : '오프라인'}</Badge></TableCell>
          <TableCell><Button variant="outline" size="sm" aria-label={`${participant.nickname}님의 이 방 기록 삭제`}
            onClick={() => onDeleteRecords(participant.id)}>기록 삭제</Button></TableCell>
        </TableRow>)}
          {data.items.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">참여 이력이 없습니다.</TableCell></TableRow>}
        </TableBody></Table></div>
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />
      </>}
    </DataState>
  </CardContent></Card>
}
