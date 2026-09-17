import { useEffect, useRef, useState } from 'react'
import { UsersIcon } from '../../components/Icons'
import { getErrorMessage, useI18n } from '../../i18n-context'
import { buttonStyles, cn } from '../../styles'
import type { RoomParticipant } from '../../types'

type ParticipantsMenuProps = {
  participants: RoomParticipant[]
  currentParticipantId?: string
  onTransfer?: (targetParticipantId: string) => Promise<void>
}

export function ParticipantsMenu({
  participants,
  currentParticipantId,
  onTransfer,
}: ParticipantsMenuProps) {
  const { t } = useI18n()
  const containerRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [busyParticipantId, setBusyParticipantId] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return

    function closeOnOutsideClick(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  async function transferManager(participant: RoomParticipant) {
    if (!onTransfer || participant.isManager || busyParticipantId) return
    if (
      !window.confirm(
        t('manager.transferConfirm', { nickname: participant.nickname }),
      )
    ) {
      return
    }

    setBusyParticipantId(participant.id)
    setError('')
    try {
      await onTransfer(participant.id)
      setOpen(false)
    } catch (requestError) {
      setError(getErrorMessage(requestError, t))
    } finally {
      setBusyParticipantId('')
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        className={cn(
          'relative grid size-10 place-items-center rounded-[10px] border border-line bg-panel text-muted',
          'transition-colors hover:border-purple/50 hover:bg-purple/[0.08] hover:text-ink',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple',
        )}
        type="button"
        aria-label={t('participants.openList')}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setError('')
          setOpen((current) => !current)
        }}
      >
        <UsersIcon size={19} />
        <span className="absolute -top-1.5 -right-1.5 grid min-w-5 place-items-center rounded-full border-2 border-canvas bg-lime px-1 py-0.5 font-mono text-[9px] font-black leading-none text-[#11140a]">
          {participants.length}
        </span>
      </button>

      {open && (
        <div
          className="absolute top-full right-0 z-40 mt-2 w-[min(320px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-line bg-[#15121b]/98 p-3 shadow-[0_24px_70px_rgba(0,0,0,.55)] backdrop-blur-xl"
          role="dialog"
          aria-label={t('participants.title')}
        >
          <div className="flex items-center justify-between gap-4 px-1.5 pt-1 pb-3">
            <div>
              <span className="text-[9px] font-black tracking-[0.16em] text-lime">
                IN THIS ROOM
              </span>
              <h2 className="mt-1 text-base tracking-[-0.02em]">
                {t('participants.title')}
              </h2>
            </div>
            <span className="rounded-full border border-line bg-white/[0.035] px-2.5 py-1 font-mono text-[10px] text-muted">
              {t('participants.count', { count: participants.length })}
            </span>
          </div>

          <ul className="m-0 flex max-h-[320px] list-none flex-col gap-1 overflow-y-auto p-0">
            {participants.map((roomParticipant) => {
              const isCurrent = roomParticipant.id === currentParticipantId
              return (
                <li
                  className="flex min-h-14 items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-white/[0.04]"
                  key={roomParticipant.id}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full border border-purple/25 bg-purple/[0.08] text-sm font-black text-purple-light">
                    {roomParticipant.nickname.trim().slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px]">
                        {roomParticipant.nickname}
                      </strong>
                      {isCurrent && (
                        <span className="shrink-0 text-[10px] text-dim">
                          {t('participants.you')}
                        </span>
                      )}
                    </div>
                    {roomParticipant.isManager && (
                      <span className="text-[10px] font-bold text-lime">
                        {t('manager.badge')}
                      </span>
                    )}
                  </div>
                  {onTransfer && !roomParticipant.isManager && (
                    <button
                      className={cn(
                        buttonStyles({ intent: 'outline', size: 'sm' }),
                        'min-h-8 shrink-0 px-2.5 text-[10px]',
                      )}
                      type="button"
                      disabled={Boolean(busyParticipantId)}
                      onClick={() => void transferManager(roomParticipant)}
                    >
                      {busyParticipantId === roomParticipant.id
                        ? t('participants.transferring')
                        : t('manager.transferButton')}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>

          {error && (
            <p
              className="mx-1 mt-2 mb-0 rounded-[9px] border border-danger/30 bg-danger/[0.08] px-3 py-2 text-xs leading-5 text-[#ffd4db]"
              role="alert"
            >
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
