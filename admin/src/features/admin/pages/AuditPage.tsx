import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { adminApi } from '../api'
import { DataState, PageHeading } from '../components/DataState'
import { useAdminData } from '../hooks/useAdminData'
import type { AuditEntry } from '../types'
import { formatDate } from '../../../shared/format'

const actionLabels: Record<AuditEntry['action'], string> = {
  room_paused: '방 재생 일시정지',
  room_resumed: '방 재생 재개',
  sessions_revoked: '사용자 세션 해제',
  room_user_records_deleted: '방 내 사용자 기록 삭제',
}

export function AuditPage() {
  const { data, error, loading, reload } = useAdminData(adminApi.audit)
  return <>
    <PageHeading title="운영 기록" description="운영자 변경 작업의 최근 30건을 확인합니다."
      action={<Button variant="outline" size="sm" onClick={reload}>새로고침</Button>} />
    <Card><CardHeader><CardTitle>최근 작업</CardTitle></CardHeader>
      <CardContent><DataState loading={loading} error={error} onRetry={reload}>
        {data && <div className="overflow-x-auto"><Table><TableHeader><TableRow>
          <TableHead>시각</TableHead><TableHead>작업</TableHead><TableHead>대상</TableHead><TableHead>운영자 Discord ID</TableHead>
        </TableRow></TableHeader><TableBody>
          {data.items.map((entry) => <TableRow key={entry.id}>
            <TableCell className="whitespace-nowrap">{formatDate(entry.createdAt)}</TableCell>
            <TableCell>{actionLabels[entry.action] ?? entry.action}</TableCell>
            <TableCell className="font-mono text-xs">{entry.targetType === 'room' ? '방 ' : '사용자 '}{entry.targetId}</TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground">{entry.adminDiscordId}</TableCell>
          </TableRow>)}
          {data.items.length === 0 && <TableRow><TableCell colSpan={4} className="py-10 text-center text-muted-foreground">운영 작업 기록이 없습니다.</TableCell></TableRow>}
        </TableBody></Table></div>}
      </DataState></CardContent>
    </Card>
  </>
}
