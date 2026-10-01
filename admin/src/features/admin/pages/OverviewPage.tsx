import { Activity, DoorOpen, ListMusic, Play, RefreshCw, Users } from 'lucide-react'
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, type ChartConfig } from '@/components/ui/chart'
import { adminApi } from '../api'
import { DataState, PageHeading } from '../components/DataState'
import { useAdminData } from '../hooks/useAdminData'
import { formatDate, formatNumber } from '../../../shared/format'

const chartConfig = {
  plays: { label: '재생', color: 'var(--chart-1)' },
  rooms: { label: '생성된 방', color: 'var(--chart-2)' },
} satisfies ChartConfig

export function OverviewPage() {
  const { data, error, loading, reload } = useAdminData(adminApi.overview, 30_000)
  const chartData = data?.daily.map(({ startAt, ...counts }) => {
    const date = new Date(startAt)
    const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    return { day, ...counts }
  })
  const cards = data ? [
    { label: '전체 사용자', value: data.totals.users, icon: Users },
    { label: '전체 방', value: data.totals.rooms, icon: DoorOpen },
    { label: '접속 중인 방', value: data.totals.activeRooms, icon: Activity },
    { label: '온라인 참여자', value: data.totals.onlineParticipants, icon: Users },
    { label: '최근 24시간 재생', value: data.totals.playsToday, icon: Play },
    { label: '누적 재생', value: data.totals.totalPlays, icon: Play },
    { label: '대기 중인 곡', value: data.totals.queuedSongs, icon: ListMusic },
  ] : []

  return <>
    <PageHeading title="운영 개요" description="서비스 현황과 최근 14일 활동을 확인합니다."
      action={<Button variant="outline" size="sm" onClick={reload}><RefreshCw aria-hidden="true" /> 새로고침</Button>} />
    <DataState loading={loading} error={error} onRetry={reload}>
      {data && <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map(({ label, value, icon: Icon }) => <Card key={label} size="sm">
            <CardHeader className="flex items-center justify-between">
              <CardDescription>{label}</CardDescription><Icon className="size-4 text-muted-foreground" aria-hidden="true" />
            </CardHeader>
            <CardContent className="text-2xl font-semibold tabular-nums">{formatNumber(value)}</CardContent>
          </Card>)}
        </div>
        <Card>
          <CardHeader><CardTitle>재생·방 생성 추이</CardTitle>
            <CardDescription>최근 14일 · 브라우저 현지 날짜 기준</CardDescription></CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-72 w-full aspect-auto">
              <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 8, left: -12 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tickFormatter={(day: string) => day.slice(5)} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                <Tooltip formatter={(value, name) => [formatNumber(Number(value)), name === 'plays' ? '재생' : '생성된 방']} />
                <Line dataKey="plays" stroke="var(--color-chart-1)" strokeWidth={2} dot={false} type="monotone" />
                <Line dataKey="rooms" stroke="var(--color-chart-2)" strokeWidth={2} dot={false} type="monotone" />
              </LineChart>
            </ChartContainer>
            <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-[var(--chart-1)]" />재생</span>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-[var(--chart-2)]" />생성된 방</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>서비스 상태</CardTitle><CardDescription>마지막 갱신 {formatDate(data.generatedAt)}</CardDescription></CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Badge variant="secondary">가동 {Math.floor(data.service.uptimeSeconds / 3600)}시간 {Math.floor(data.service.uptimeSeconds % 3600 / 60)}분</Badge>
            <Badge variant={data.service.discordLoginEnabled ? 'secondary' : 'destructive'}>
              Discord 로그인 {data.service.discordLoginEnabled ? '설정됨' : '미설정'}
            </Badge>
            <Badge variant={data.service.youtubeApiConfigured ? 'secondary' : 'destructive'}>
              YouTube API 키 {data.service.youtubeApiConfigured ? '설정됨' : '미설정'}
            </Badge>
            <p className="w-full text-xs text-muted-foreground">YouTube API 할당량 사용량은 현재 수집하지 않습니다.</p>
          </CardContent>
        </Card>
      </div>}
    </DataState>
  </>
}
