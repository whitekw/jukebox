import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { adminApi } from '../api'
import { useAdminData } from '../hooks/useAdminData'
import { ApiError } from '../../../shared/http'
import type { RoomVideoRecordsPreview } from '../types'

export function DeleteRoomVideoRecordsDialog({ code, videoId, onClose, onDeleted }: {
  code: string
  videoId: string
  onClose: () => void
  onDeleted: (result: Pick<RoomVideoRecordsPreview, 'target' | 'counts'>) => void
}) {
  const loadPreview = useCallback((signal: AbortSignal) => adminApi.roomVideoRecords(code, videoId, signal), [code, videoId])
  const { data, loading, error, reload } = useAdminData(loadPreview)
  const [confirmation, setConfirmation] = useState('')
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const active = useRef(true)
  useEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])

  async function remove() {
    if (!data || saving || confirmation !== data.code) return
    setSaving(true)
    setActionError(null)
    try {
      const result = await adminApi.deleteRoomVideoRecords(code, videoId, confirmation, data.revision)
      if (active.current) onDeleted(result)
    } catch (cause) {
      if (!active.current) return
      setActionError(cause instanceof Error ? cause.message : '영상 기록을 삭제하지 못했습니다.')
      if (cause instanceof ApiError && cause.code === 'ROOM_RECORDS_CHANGED') {
        setConfirmation('')
        reload()
      }
    } finally {
      if (active.current) setSaving(false)
    }
  }

  return <AlertDialog open onOpenChange={(open) => { if (!open && !saving) onClose() }}>
    <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
      <AlertDialogHeader>
        <AlertDialogTitle>이 방의 영상 기록을 모두 삭제할까요?</AlertDialogTitle>
        <AlertDialogDescription>
          같은 영상의 모든 신청·자동 재생·재생기록·통계·투표·관련 활동과 자동 재생 제외 정보를 영구 삭제합니다. 되돌릴 수 없습니다.
          참여자, 채팅, 개인 플레이리스트와 다른 방의 기록은 유지됩니다.
        </AlertDialogDescription>
      </AlertDialogHeader>
      {loading ? <p role="status" className="text-sm text-muted-foreground">삭제 범위를 확인하고 있습니다.</p>
        : error ? <div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p><Button variant="outline" size="sm" onClick={reload}>다시 확인</Button></div>
          : data && <div className="space-y-4 text-sm">
            <div className="rounded-lg border p-3">
              <p className="font-medium">{data.roomTitle} · {data.code}</p>
              <p className="mt-2 break-words font-medium">{data.target.title}</p>
              <p className="text-muted-foreground">{data.target.artist}</p>
              <p className="break-all font-mono text-xs text-muted-foreground">영상 ID {data.target.videoId}</p>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              <dt>신청·자동 재생 전체</dt><dd className="text-right tabular-nums">{data.counts.songs}건</dd>
              <dt>현재 / 대기 곡</dt><dd className="text-right tabular-nums">{data.counts.currentSongs} / {data.counts.queuedSongs}건</dd>
              <dt>재생·통계 기록</dt><dd className="text-right tabular-nums">{data.counts.plays}건</dd>
              <dt>재생 실패 기록</dt><dd className="text-right tabular-nums">{data.counts.failedSongs}건</dd>
              <dt>투표 / 관련 활동</dt><dd className="text-right tabular-nums">{data.counts.votes} / {data.counts.events}건</dd>
              <dt>자동 재생 제외</dt><dd className="text-right tabular-nums">{data.counts.autoplayExclusions}건</dd>
            </dl>
            <p className="text-muted-foreground">현재 재생 중이면 다음 곡으로 넘어가고, 자동 재생 후보를 다시 계산합니다. 이후 이 영상을 다시 신청할 수 있습니다.</p>
            <p className="text-xs text-muted-foreground">제목만 저장된 과거 활동 중 동명 영상과 구분할 수 없는 항목은 유지됩니다.</p>
            <label className="block space-y-2">
              <span>확인을 위해 방 코드 <strong>{data.code}</strong>를 입력해주세요.</span>
              <Input autoComplete="off" value={confirmation} disabled={saving} onChange={(event) => setConfirmation(event.target.value)} />
            </label>
          </div>}
      {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={saving}>취소</AlertDialogCancel>
        <AlertDialogAction variant="destructive" disabled={saving || loading || Boolean(error) || !data || confirmation !== data.code}
          onClick={(event) => { event.preventDefault(); void remove() }}>
          {saving ? '삭제 중…' : '이 영상의 모든 기록 삭제'}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
}
