import { useEffect, useMemo, useState } from 'react'
import { SkipIcon } from '../../components/Icons'
import {
  buttonStyles,
  cn,
  formControlStyles,
  panelStyles,
} from '../../styles'
import type { RoomState } from '../../types'

type RoomSettings = {
  hostVolume?: number
  maxSongsPerParticipant?: number
}

type ManagerPanelProps = {
  room: RoomState
  participantId: string
  onAdvance: () => Promise<void>
  onUpdateSettings: (settings: RoomSettings) => Promise<void>
  onTransfer: (targetParticipantId: string) => Promise<void>
}

export function ManagerPanel({
  room,
  participantId,
  onAdvance,
  onUpdateSettings,
  onTransfer,
}: ManagerPanelProps) {
  const [volume, setVolume] = useState(room.hostVolume)
  const [targetParticipantId, setTargetParticipantId] = useState('')
  const [busyAction, setBusyAction] = useState('')
  const [error, setError] = useState('')
  const transferTargets = useMemo(
    () =>
      room.participants.filter(
        (participant) => participant.id !== participantId,
      ),
    [participantId, room.participants],
  )

  useEffect(() => {
    setVolume(room.hostVolume)
  }, [room.hostVolume])

  useEffect(() => {
    if (
      targetParticipantId &&
      !transferTargets.some(
        (participant) => participant.id === targetParticipantId,
      )
    ) {
      setTargetParticipantId('')
    }
  }, [targetParticipantId, transferTargets])

  async function runAction(key: string, action: () => Promise<void>) {
    if (busyAction) return
    setBusyAction(key)
    setError('')
    try {
      await action()
    } catch (requestError) {
      setError((requestError as Error).message)
    } finally {
      setBusyAction('')
    }
  }

  function commitVolume() {
    if (volume === room.hostVolume) return
    void runAction('volume', () => onUpdateSettings({ hostVolume: volume }))
  }

  function transferManager() {
    const target = transferTargets.find(
      (participant) => participant.id === targetParticipantId,
    )
    if (!target) return
    if (
      !window.confirm(
        `${target.nickname}님에게 관리 권한을 넘길까요? 권한을 넘긴 뒤에는 관리 기능을 사용할 수 없습니다.`,
      )
    ) {
      return
    }
    void runAction('transfer', () => onTransfer(target.id))
  }

  return (
    <section className={panelStyles({ tone: 'soft', padding: 'responsive' })}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="text-[10px] font-black tracking-[0.16em] text-lime">
            ROOM MANAGER
          </span>
          <h2 className="mt-1.5 mb-0 text-[22px] tracking-[-0.03em]">
            호스트 제어
          </h2>
        </div>
        <span className="rounded-full border border-lime/20 bg-lime/[0.05] px-3 py-1.5 text-[11px] font-bold text-lime">
          관리자
        </span>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-line bg-black/10 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-xs font-bold text-muted">
                현재 재생
              </span>
              <p className="mt-1 mb-0 max-w-[260px] overflow-hidden text-ellipsis whitespace-nowrap text-sm">
                {room.currentSong?.title ?? '재생 중인 곡 없음'}
              </p>
            </div>
            <button
              className={cn(
                buttonStyles({ intent: 'outline', size: 'md' }),
                'min-h-10 shrink-0 bg-white/[0.06] font-bold',
              )}
              type="button"
              disabled={!room.currentSong || Boolean(busyAction)}
              onClick={() => void runAction('advance', onAdvance)}
            >
              <SkipIcon size={18} />
              건너뛰기
            </button>
          </div>
        </div>

        <label className="block rounded-xl border border-line bg-black/10 p-4">
          <span className="flex items-center justify-between gap-3 text-xs font-bold text-muted">
            호스트 볼륨
            <strong className="text-sm text-ink">{volume}%</strong>
          </span>
          <input
            className="mt-4 h-2 w-full cursor-pointer accent-purple disabled:cursor-not-allowed disabled:opacity-40"
            type="range"
            min="0"
            max="100"
            step="5"
            value={volume}
            disabled={Boolean(busyAction)}
            onChange={(event) => setVolume(Number(event.target.value))}
            onPointerUp={commitVolume}
            onKeyUp={commitVolume}
            onBlur={commitVolume}
          />
        </label>

        <label className="block rounded-xl border border-line bg-black/10 p-4">
          <span className="text-xs font-bold text-muted">
            인당 신청 가능 최대 곡 수
          </span>
          <select
            className={cn(
              formControlStyles({ weight: 'bold' }),
              'mt-3 bg-[#17141f] focus:border-purple/65',
            )}
            value={room.maxSongsPerParticipant}
            disabled={Boolean(busyAction)}
            onChange={(event) =>
              void runAction('maximum', () =>
                onUpdateSettings({
                  maxSongsPerParticipant: Number(event.target.value),
                }),
              )
            }
          >
            {Array.from({ length: 10 }, (_, index) => index + 1).map(
              (maximum) => (
                <option key={maximum} value={maximum}>
                  {maximum}곡
                </option>
              ),
            )}
          </select>
        </label>

        <div className="rounded-xl border border-line bg-black/10 p-4">
          <span className="text-xs font-bold text-muted">
            관리 권한 이전
          </span>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <select
              className={cn(
                formControlStyles(),
                'min-h-11 w-full bg-[#17141f] focus:border-purple/65 sm:min-w-0 sm:flex-1',
              )}
              value={targetParticipantId}
              disabled={transferTargets.length === 0 || Boolean(busyAction)}
              onChange={(event) => setTargetParticipantId(event.target.value)}
            >
              <option value="">참여자 선택</option>
              {transferTargets.map((participant) => (
                <option key={participant.id} value={participant.id}>
                  {participant.nickname}
                </option>
              ))}
            </select>
            <button
              className={cn(
                buttonStyles({ intent: 'purple', size: 'md' }),
                'shrink-0 font-black',
              )}
              type="button"
              disabled={!targetParticipantId || Boolean(busyAction)}
              onClick={transferManager}
            >
              넘기기
            </button>
          </div>
        </div>
      </div>

      {error && (
        <p
          className="mt-4 mb-0 rounded-[10px] border border-danger/30 bg-danger/[0.08] px-3.5 py-2.5 text-sm text-[#ffd4db]"
          role="alert"
        >
          {error}
        </p>
      )}

      <p className="mt-4 mb-0 text-xs leading-5 text-dim">
        대기열의 순서 변경과 삭제는 아래 대기열에서 바로 관리할 수 있습니다.
      </p>
    </section>
  )
}
