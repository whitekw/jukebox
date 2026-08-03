import { useEffect, useMemo, useState } from 'react'
import {
  PauseIcon,
  PlayIcon,
  SkipIcon,
} from '../../components/Icons'
import {
  buttonStyles,
  cn,
  formControlStyles,
  panelStyles,
} from '../../styles'
import { getErrorMessage, useI18n } from '../../i18n-context'
import type { RoomState } from '../../types'

type RoomSettings = {
  hostVolume?: number
  maxSongsPerParticipant?: number
}

type ManagerPanelProps = {
  room: RoomState
  participantId: string
  onTogglePlayback: () => Promise<void>
  onAdvance: () => Promise<void>
  onUpdateSettings: (settings: RoomSettings) => Promise<void>
  onTransfer: (targetParticipantId: string) => Promise<void>
}

export function ManagerPanel({
  room,
  participantId,
  onTogglePlayback,
  onAdvance,
  onUpdateSettings,
  onTransfer,
}: ManagerPanelProps) {
  const { t } = useI18n()
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
      setError(getErrorMessage(requestError, t))
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
        t('manager.transferConfirm', { nickname: target.nickname }),
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
            {t('manager.title')}
          </h2>
        </div>
        <span className="rounded-full border border-lime/20 bg-lime/[0.05] px-3 py-1.5 text-[11px] font-bold text-lime">
          {t('manager.badge')}
        </span>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-line bg-black/10 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <span className="text-xs font-bold text-muted">
                {t('manager.currentPlayback')}
              </span>
              <p className="mt-1 mb-0 max-w-[260px] overflow-hidden text-ellipsis whitespace-nowrap text-sm">
                {room.playbackBlocked
                  ? t('status.autoplayBlocked')
                  : room.currentSong?.title ?? t('manager.noCurrentSong')}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
              <button
                className={cn(
                  buttonStyles({ intent: 'outline', size: 'md' }),
                  'min-h-10 bg-white/[0.06] font-bold',
                )}
                type="button"
                disabled={!room.currentSong || Boolean(busyAction)}
                onClick={() =>
                  void runAction('playback', onTogglePlayback)
                }
              >
                {room.playbackPaused ? (
                  <PlayIcon size={18} />
                ) : (
                  <PauseIcon size={18} />
                )}
                {room.playbackBlocked
                  ? t('manager.tryPlayback')
                  : room.playbackPaused
                    ? t('manager.resume')
                    : t('manager.pause')}
              </button>
              <button
                className={cn(
                  buttonStyles({ intent: 'outline', size: 'md' }),
                  'min-h-10 bg-white/[0.06] font-bold',
                )}
                type="button"
                disabled={!room.currentSong || Boolean(busyAction)}
                onClick={() => void runAction('advance', onAdvance)}
              >
                <SkipIcon size={18} />
                {t('manager.skip')}
              </button>
            </div>
          </div>
        </div>

        <label className="block rounded-xl border border-line bg-black/10 p-4">
          <span className="flex items-center justify-between gap-3 text-xs font-bold text-muted">
            {t('manager.hostVolume')}
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
            {t('manager.maxSongs')}
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
                  {t(
                    maximum === 1
                      ? 'common.songCountOne'
                      : 'common.songCount',
                    { count: maximum },
                  )}
                </option>
              ),
            )}
          </select>
        </label>

        <div className="rounded-xl border border-line bg-black/10 p-4">
          <span className="text-xs font-bold text-muted">
            {t('manager.transfer')}
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
              <option value="">{t('manager.selectParticipant')}</option>
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
              {t('manager.transferButton')}
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
        {t('manager.queueHint')}
      </p>
    </section>
  )
}
