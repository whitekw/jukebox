import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { adminApi } from '../api'
import { useAdminData } from '../hooks/useAdminData'
import { ApiError } from '../../../shared/http'
import type { RoomUserRecordsPreview } from '../types'

export function DeleteRoomUserRecordsDialog({ code, participantId, onClose, onDeleted }: {
  code: string
  participantId: string
  onClose: () => void
  onDeleted: (result: Pick<RoomUserRecordsPreview, 'target' | 'counts'>) => void
}) {
  const loadPreview = useCallback((signal: AbortSignal) => adminApi.roomUserRecords(code, participantId, signal), [code, participantId])
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
      const result = await adminApi.deleteRoomUserRecords(code, participantId, confirmation, data.revision)
      if (active.current) onDeleted(result)
    } catch (cause) {
      if (!active.current) return
      setActionError(cause instanceof Error ? cause.message : '기록을 삭제하지 못했습니다.')
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
        <AlertDialogTitle>이 방의 사용자 기록을 모두 삭제할까요?</AlertDialogTitle>
        <AlertDialogDescription>
          신청곡·재생기록·통계·주고받은 투표·채팅·활동 기록·참여 정보를 영구 삭제합니다. 되돌릴 수 없습니다.
          계정, 개인 플레이리스트, 다른 방의 기록과 방 소유권은 유지됩니다.
        </AlertDialogDescription>
      </AlertDialogHeader>
      {loading ? <p role="status" className="text-sm text-muted-foreground">삭제 범위를 확인하고 있습니다.</p>
        : error ? <div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p><Button variant="outline" size="sm" onClick={reload}>다시 확인</Button></div>
          : data && <div className="space-y-4 text-sm">
            <div className="rounded-lg border p-3">
              <p className="font-medium">{data.roomTitle} · {data.code}</p>
              <p className="mt-1 font-medium">{data.target.nickname}</p>
              <p className="break-all font-mono text-xs text-muted-foreground">{data.target.discordId ? `Discord ${data.target.discordId}` : `참여 ID ${data.target.participantId}`}</p>
              <p className="mt-2 text-muted-foreground">{data.target.userId ? '이 계정의 재입장 이력을 모두 포함합니다.' : '선택한 비로그인 참여 이력만 삭제합니다.'}</p>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              <dt>신청곡 전체</dt><dd className="text-right tabular-nums">{data.counts.songs}건</dd>
              <dt>현재 / 대기 곡</dt><dd className="text-right tabular-nums">{data.counts.currentSongs} / {data.counts.queuedSongs}건</dd>
              <dt>재생·통계 기록</dt><dd className="text-right tabular-nums">{data.counts.plays}건</dd>
              <dt>주고받은 투표</dt><dd className="text-right tabular-nums">{data.counts.votes}건</dd>
              <dt>채팅 / 활동 기록</dt><dd className="text-right tabular-nums">{data.counts.messages} / {data.counts.events}건</dd>
              <dt>참여 이력</dt><dd className="text-right tabular-nums">{data.counts.participants}건</dd>
            </dl>
            <p className="text-muted-foreground">현재 연결도 종료합니다. 대상의 곡이 재생 중이면 다음 곡으로 넘어가고, 자동 재생 후보를 다시 계산합니다.</p>
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
          {saving ? '삭제 중…' : '이 방의 모든 기록 삭제'}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
}
