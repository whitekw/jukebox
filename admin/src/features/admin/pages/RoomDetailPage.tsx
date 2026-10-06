import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Pause, Play } from 'lucide-react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { adminApi } from '../api'
import { DataState, PageHeading } from '../components/DataState'
import { useAdminData } from '../hooks/useAdminData'
import { DeleteRoomUserRecordsDialog } from '../components/DeleteRoomUserRecordsDialog'
import { RoomParticipants } from '../components/RoomParticipants'
import { RoomVideos } from '../components/RoomVideos'
import { DeleteRoomVideoRecordsDialog } from '../components/DeleteRoomVideoRecordsDialog'
import { formatDate } from '../../../shared/format'

export function RoomDetailPage() {
  const { code = '' } = useParams()
  const loadRoom = useCallback((signal: AbortSignal) => adminApi.room(code, signal), [code])
  const { data, error, loading, reload } = useAdminData(loadRoom)
  const [actionError, setActionError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [cleanupParticipantId, setCleanupParticipantId] = useState<string | null>(null)
  const [cleanupVideoId, setCleanupVideoId] = useState<string | null>(null)
  const [cleanupMessage, setCleanupMessage] = useState<string | null>(null)
  const [recordsRevision, setRecordsRevision] = useState(0)
  useEffect(() => { setCleanupParticipantId(null); setCleanupVideoId(null); setCleanupMessage(null) }, [code])

  async function togglePlayback() {
    if (!data || saving) return
    setSaving(true)
    setActionError(null)
    try {
      await adminApi.setRoomPaused(data.code, !data.playbackPaused)
      reload()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : '재생 상태를 변경하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return <>
    <Button asChild variant="ghost" size="sm"><Link to="/rooms"><ArrowLeft aria-hidden="true" /> 방 목록</Link></Button>
    <PageHeading title={data?.title ?? '방 상세'} description={`${code.toUpperCase()} · 방 상태와 최근 곡`} />
    <DataState loading={loading} error={error} onRetry={reload}>
      {data && <div className="space-y-5">
        {cleanupMessage && <p role="status" className="text-sm">{cleanupMessage}</p>}
        <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
          <Card><CardHeader><CardTitle>방 정보</CardTitle></CardHeader>
            <CardContent className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div><span className="text-muted-foreground">소유자</span><p>{data.ownerName ?? '—'}</p></div>
              <div><span className="text-muted-foreground">생성</span><p>{formatDate(data.createdAt)}</p></div>
              <div><span className="text-muted-foreground">재생 모드</span><p>{data.playbackMode === 'host_only' ? '호스트 기기' : '모든 기기'}</p></div>
              <div><span className="text-muted-foreground">온라인 참여자</span><p>{data.onlineParticipants}명</p></div>
              <div><span className="text-muted-foreground">비로그인 참여</span><p>{data.allowGuests ? '허용' : '차단'}</p></div>
              <div><span className="text-muted-foreground">기록 기반 자동 재생</span><p>{data.historyAutoplay ? '켜짐' : '꺼짐'}</p></div>
            </CardContent>
          </Card>
          <Card className="lg:w-72"><CardHeader><CardTitle>긴급 재생 제어</CardTitle>
            <CardDescription>방 참여자에게 즉시 반영되고 운영 기록에 남습니다.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <Badge variant={data.playbackPaused ? 'outline' : 'secondary'}>{!data.songs.some((song) => song.status === 'current') ? '재생 대기' : data.playbackPaused ? '일시정지' : '재생 중'}</Badge>
              <AlertDialog>
                <AlertDialogTrigger asChild><Button className="w-full" variant="outline" disabled={saving || !data.songs.some((song) => song.status === 'current')}>
                  {data.playbackPaused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
                  {data.playbackPaused ? '재생 재개' : '재생 일시정지'}
                </Button></AlertDialogTrigger>
                <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>재생 상태를 변경할까요?</AlertDialogTitle>
                  <AlertDialogDescription>{data.title} 방의 재생을 {data.playbackPaused ? '재개' : '일시정지'}합니다. 모든 참여자에게 즉시 반영됩니다.</AlertDialogDescription>
                </AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>취소</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void togglePlayback()}>변경</AlertDialogAction>
                </AlertDialogFooter></AlertDialogContent>
              </AlertDialog>
              {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
            </CardContent>
          </Card>
        </div>
        <RoomVideos key={`${code}:${recordsRevision}`} code={code} onDeleteRecords={setCleanupVideoId} />
        <div className="grid gap-4 xl:grid-cols-2">
          <RoomParticipants key={`${code}:${recordsRevision}`} code={code} onDeleteRecords={setCleanupParticipantId} />
          <Card><CardHeader><CardTitle>대기열·최근 재생</CardTitle><CardDescription>현재 곡과 최근 항목 50건</CardDescription></CardHeader>
            <CardContent className="max-h-96 overflow-auto"><Table><TableHeader><TableRow><TableHead>곡</TableHead><TableHead>상태</TableHead><TableHead>시각</TableHead></TableRow></TableHeader>
              <TableBody>{data.songs.map((song) => <TableRow key={song.id}>
                <TableCell><div className="max-w-60 truncate font-medium" title={song.title}>{song.title}</div><div className="text-xs text-muted-foreground">{song.artist}{song.isAutoplay ? ' · 자동 재생' : ''}</div></TableCell>
                <TableCell><Badge variant={song.status === 'current' ? 'secondary' : 'outline'}>{song.status === 'current' ? '현재' : song.status === 'queued' ? '대기' : '재생 완료'}</Badge></TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(song.startedAt ?? song.createdAt)}</TableCell>
              </TableRow>)}
                {data.songs.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">곡이 없습니다.</TableCell></TableRow>}
              </TableBody></Table></CardContent>
          </Card>
        </div>
      </div>}
    </DataState>
    {cleanupVideoId && <DeleteRoomVideoRecordsDialog key={`${code}:${cleanupVideoId}`}
      code={code} videoId={cleanupVideoId} onClose={() => setCleanupVideoId(null)}
      onDeleted={(result) => {
        setCleanupVideoId(null)
        setCleanupMessage(`${result.target.title} 영상의 이 방 기록을 삭제했습니다. 신청·자동 재생 ${result.counts.songs}건 · 재생 ${result.counts.plays}건 · 투표 ${result.counts.votes}건 · 활동 ${result.counts.events}건`)
        setRecordsRevision((value) => value + 1)
        reload()
      }} />}
    {cleanupParticipantId && <DeleteRoomUserRecordsDialog key={`${code}:${cleanupParticipantId}`}
      code={code} participantId={cleanupParticipantId} onClose={() => setCleanupParticipantId(null)}
      onDeleted={(result) => {
        setCleanupParticipantId(null)
        setCleanupMessage(`${result.target.nickname}님의 이 방 기록을 삭제했습니다. 신청곡 ${result.counts.songs}건 · 투표 ${result.counts.votes}건 · 채팅·활동 ${result.counts.messages + result.counts.events}건 · 참여 이력 ${result.counts.participants}건`)
        setRecordsRevision((value) => value + 1)
        reload()
      }} />}
  </>
}
