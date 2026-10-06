import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Heart, ListMusic } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { adminApi } from '../api'
import { DataState, PageHeading, Pagination } from '../components/DataState'
import { UserPlaylistTracks } from '../components/UserPlaylistTracks'
import { useAdminData } from '../hooks/useAdminData'

export function UserPlaylistsPage() {
  const { userId = '' } = useParams()
  return <UserPlaylistsContent key={userId} userId={userId} />
}

function UserPlaylistsContent({ userId }: { userId: string }) {
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const loadPlaylists = useCallback((signal: AbortSignal) => adminApi.userPlaylists(userId, page, signal), [userId, page])
  const { data, loading, error, reload } = useAdminData(loadPlaylists)
  const selected = data?.items.find(({ id }) => id === selectedId) ?? data?.items[0]
  return <>
    <Button asChild variant="ghost" size="sm"><Link to="/users"><ArrowLeft aria-hidden="true" /> 사용자 목록</Link></Button>
    <PageHeading title={data ? `${data.user.displayName}님의 플레이리스트` : '사용자 플레이리스트'}
      description={data ? `Discord ${data.user.discordId} · 즐겨찾기와 개인 플레이리스트 조회` : '즐겨찾기와 개인 플레이리스트를 조회합니다.'}
      action={<Button variant="outline" size="sm" onClick={reload}>새로고침</Button>} />
    <DataState loading={loading} error={error} onRetry={reload}>
      {data && <div className="grid items-start gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <Card className="min-w-0"><CardHeader><CardTitle>플레이리스트</CardTitle>
          <CardDescription>총 {data.total.toLocaleString('ko-KR')}개 · 사용자 지정 순서</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="max-h-[28rem] space-y-2 overflow-auto" aria-label="사용자 플레이리스트 목록">
              {data.items.map((playlist) => {
                const name = playlist.kind === 'favorites' ? '즐겨찾기' : playlist.name
                const Icon = playlist.kind === 'favorites' ? Heart : ListMusic
                return <Button key={playlist.id} variant={playlist.id === selected?.id ? 'secondary' : 'outline'}
                  className="h-auto w-full justify-start gap-3 py-3 text-left" aria-pressed={playlist.id === selected?.id}
                  aria-label={`${name} · ${playlist.trackCount}곡`} onClick={() => setSelectedId(playlist.id)}>
                  <Icon aria-hidden="true" className="shrink-0" />
                  <span className="min-w-0 flex-1"><span className="block truncate" title={name}>{name}</span>
                    <span className="block text-xs font-normal text-muted-foreground">{playlist.trackCount.toLocaleString('ko-KR')}곡 · {playlist.kind === 'favorites' ? '기본 목록' : '개인 목록'}</span></span>
                </Button>
              })}
              {data.items.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">저장된 플레이리스트가 없습니다.</p>}
            </div>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />
          </CardContent>
        </Card>
        {selected ? <UserPlaylistTracks key={`${userId}:${selected.id}`} userId={userId} playlist={selected} />
          : <Card><CardContent><p className="text-sm text-muted-foreground">조회할 플레이리스트가 없습니다.</p></CardContent></Card>}
      </div>}
    </DataState>
  </>
}
