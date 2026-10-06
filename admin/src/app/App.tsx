import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { adminApi } from '../features/admin/api'
import { AdminLayout } from '../features/admin/components/AdminLayout'
import type { AdminUser } from '../features/admin/types'
import { ApiError } from '../shared/http'

const AuditPage = lazy(() => import('../features/admin/pages/AuditPage').then(({ AuditPage }) => ({ default: AuditPage })))
const OverviewPage = lazy(() => import('../features/admin/pages/OverviewPage').then(({ OverviewPage }) => ({ default: OverviewPage })))
const RoomDetailPage = lazy(() => import('../features/admin/pages/RoomDetailPage').then(({ RoomDetailPage }) => ({ default: RoomDetailPage })))
const RoomsPage = lazy(() => import('../features/admin/pages/RoomsPage').then(({ RoomsPage }) => ({ default: RoomsPage })))
const UsersPage = lazy(() => import('../features/admin/pages/UsersPage').then(({ UsersPage }) => ({ default: UsersPage })))
const UserPlaylistsPage = lazy(() => import('../features/admin/pages/UserPlaylistsPage').then(({ UserPlaylistsPage }) => ({ default: UserPlaylistsPage })))

type SessionState =
  | { status: 'loading' }
  | { status: 'ready'; user: AdminUser }
  | { status: 'unauthorized' }
  | { status: 'forbidden'; user: Pick<AdminUser, 'discordId' | 'displayName'> | null }
  | { status: 'error'; message: string }

function SessionGate() {
  const [session, setSession] = useState<SessionState>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    adminApi.session(controller.signal)
      .then(({ user }) => setSession({ status: 'ready', user }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (error instanceof ApiError && error.status === 401) setSession({ status: 'unauthorized' })
        else if (error instanceof ApiError && error.status === 403) {
          const details = error.details as { user?: Pick<AdminUser, 'discordId' | 'displayName'> } | undefined
          setSession({ status: 'forbidden', user: details?.user ?? null })
        }
        else setSession({ status: 'error', message: error instanceof Error ? error.message : '연결하지 못했습니다.' })
      })
    return () => controller.abort()
  }, [])

  if (session.status !== 'ready') return (
    <div className="grid min-h-screen place-items-center bg-background p-4 text-foreground">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>B-SIDE 운영</CardTitle>
          <CardDescription>{session.status === 'loading' ? '권한을 확인하고 있습니다.' :
            session.status === 'unauthorized' ? '운영자 계정으로 로그인해 주세요.' :
              session.status === 'forbidden' ? '이 계정에는 운영자 권한이 없습니다.' :
                session.message}</CardDescription>
        </CardHeader>
        {session.status === 'forbidden' && <CardContent className="space-y-2 text-sm text-muted-foreground">
          {session.user && <p>현재 계정: {session.user.displayName} · Discord ID <code className="select-all font-mono text-foreground">{session.user.discordId}</code></p>}
          <p>서버의 <code className="font-mono text-foreground">ADMIN_DISCORD_IDS</code>에 운영자 Discord ID를 등록하고 백엔드를 재시작해 주세요.</p>
        </CardContent>}
        {session.status !== 'loading' && <CardContent className="flex gap-2">
          {session.status === 'unauthorized' && <Button asChild>
            <a href="/api/auth/discord?returnTo=/admin/">Discord 로그인</a>
          </Button>}
          <Button asChild variant="outline"><a href="/">서비스로 돌아가기</a></Button>
        </CardContent>}
      </Card>
    </div>
  )

  return <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">불러오는 중...</div>}><Routes>
    <Route element={<AdminLayout user={session.user} />}>
      <Route index element={<OverviewPage />} />
      <Route path="rooms" element={<RoomsPage />} />
      <Route path="rooms/:code" element={<RoomDetailPage />} />
      <Route path="users" element={<UsersPage currentUserId={session.user.id} />} />
      <Route path="users/:userId/playlists" element={<UserPlaylistsPage />} />
      <Route path="audit" element={<AuditPage />} />
      <Route path="*" element={<OverviewPage />} />
    </Route>
  </Routes></Suspense>
}

export default function App() {
  return <BrowserRouter basename="/admin"><SessionGate /></BrowserRouter>
}
