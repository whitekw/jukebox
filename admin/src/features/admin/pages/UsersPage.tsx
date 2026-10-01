import { useCallback, useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { adminApi } from '../api'
import { DataState, PageHeading, Pagination } from '../components/DataState'
import { useAdminData } from '../hooks/useAdminData'
import type { UserSummary } from '../types'
import { formatDate } from '../../../shared/format'

export function UsersPage({ currentUserId }: { currentUserId: string }) {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  useEffect(() => {
    const timer = window.setTimeout(() => { setQuery(search.trim()); setPage(1) }, 300)
    return () => window.clearTimeout(timer)
  }, [search])
  const loadUsers = useCallback((signal: AbortSignal) => adminApi.users(query, page, signal), [query, page])
  const { data, error, loading, reload } = useAdminData(loadUsers)

  async function revoke(user: UserSummary) {
    if (savingId) return
    setSavingId(user.id)
    setActionError(null)
    setActionMessage(null)
    try {
      const result = await adminApi.revokeSessions(user.id)
      setActionMessage(`${user.displayName}님의 로그인 세션 ${result.revoked}개를 해제했습니다.`)
      reload()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : '세션을 해제하지 못했습니다.')
    } finally {
      setSavingId(null)
    }
  }

  return <>
    <PageHeading title="사용자 관리" description="로그인 계정과 방 소유 현황을 확인하고 필요한 경우 세션을 해제합니다." />
    <Card><CardHeader><CardTitle>사용자 목록</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <label className="relative block max-w-sm"><span className="sr-only">Discord ID 또는 사용자 이름 검색</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)}
            placeholder="Discord ID 또는 사용자 이름" className="pl-9" />
        </label>
        {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
        {actionMessage && <p role="status" className="text-sm">{actionMessage}</p>}
        <DataState loading={loading} error={error} onRetry={reload}>
          {data && <>
            <div className="overflow-x-auto"><Table><TableHeader><TableRow>
              <TableHead>계정</TableHead><TableHead>최근 로그인</TableHead><TableHead className="text-right">소유 방</TableHead>
              <TableHead className="text-right">활성 세션</TableHead><TableHead><span className="sr-only">관리</span></TableHead>
            </TableRow></TableHeader><TableBody>
              {data.items.map((user) => <TableRow key={user.id}>
                <TableCell><div className="font-medium">{user.displayName}</div><div className="font-mono text-xs text-muted-foreground">{user.discordId}</div></TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(user.lastLoginAt)}</TableCell>
                <TableCell className="text-right tabular-nums">{user.ownedRooms}</TableCell>
                <TableCell className="text-right tabular-nums">{user.activeSessions}</TableCell>
                <TableCell>
                  <AlertDialog><AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" disabled={user.id === currentUserId || user.activeSessions === 0 || savingId !== null}>세션 해제</Button>
                  </AlertDialogTrigger><AlertDialogContent><AlertDialogHeader>
                    <AlertDialogTitle>로그인 세션을 해제할까요?</AlertDialogTitle>
                    <AlertDialogDescription>{user.displayName}님의 모든 웹 로그인 세션을 해제합니다. 다시 로그인하기 전까지 해당 세션을 사용할 수 없습니다. 방과 계정 데이터는 유지됩니다.</AlertDialogDescription>
                  </AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>취소</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={() => void revoke(user)}>세션 해제</AlertDialogAction>
                  </AlertDialogFooter></AlertDialogContent></AlertDialog>
                </TableCell>
              </TableRow>)}
              {data.items.length === 0 && <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">검색된 사용자가 없습니다.</TableCell></TableRow>}
            </TableBody></Table></div>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />
          </>}
        </DataState>
      </CardContent>
    </Card>
  </>
}
