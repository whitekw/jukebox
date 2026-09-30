import { useEffect, useRef, useState } from 'react'
import { UsersRound as UsersIcon } from 'lucide-react'
import { getErrorMessage, useI18n } from '../../../shared/i18n/i18n-context'
import { chromeIconButtonStyles, cn } from '../../../shared/styles'
import type { RoomParticipant } from '../types'

type ParticipantsMenuProps = {
  participants: RoomParticipant[]
  currentParticipantId?: string
  onLeave?: () => Promise<void>
  onJoinAccount?: () => Promise<void>
  onSetManager?: (
    targetParticipantId: string,
    isManager: boolean,
  ) => Promise<void>
  onDisconnect?: (targetParticipantId: string) => Promise<void>
}

export function ParticipantsMenu({
  participants,
  currentParticipantId,
  onLeave,
  onJoinAccount,
  onSetManager,
  onDisconnect,
}: ParticipantsMenuProps) {
  const { t } = useI18n()
  const containerRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [busyParticipantId, setBusyParticipantId] = useState('')
  const [actionParticipantId, setActionParticipantId] = useState('')
  const [error, setError] = useState('')
  const onlineParticipants = participants.filter((participant) => participant.online)
  const offlineMembers = participants.filter((participant) => participant.isMember && !participant.online)
  const listedParticipants = [...onlineParticipants, ...offlineMembers]

  useEffect(() => {
    if (!open) return

    function closeOnOutsideClick(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
        setActionParticipantId('')
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (actionParticipantId) setActionParticipantId('')
        else setOpen(false)
      }
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open, actionParticipantId])

  async function setManager(participant: RoomParticipant) {
    if (!onSetManager || !participant.isMember || busyParticipantId) return
    const nextIsManager = !participant.isManager
    if (
      !window.confirm(
        t(
          nextIsManager
            ? 'manager.addConfirm'
            : 'manager.removeConfirm',
          { nickname: participant.nickname },
        ),
      )
    ) {
      return
    }

    setBusyParticipantId(participant.id)
    setError('')
    try {
      await onSetManager(participant.id, nextIsManager)
      setActionParticipantId('')
    } catch (requestError) {
      setError(getErrorMessage(requestError, t))
    } finally {
      setBusyParticipantId('')
    }
  }

  async function disconnect(participant: RoomParticipant) {
    if (!onDisconnect || busyParticipantId) return
    if (!window.confirm(t('participants.disconnectConfirm', { nickname: participant.nickname }))) return
    setBusyParticipantId(participant.id)
    setError('')
    try {
      await onDisconnect(participant.id)
      setActionParticipantId('')
    } catch (requestError) {
      setError(getErrorMessage(requestError, t))
    } finally {
      setBusyParticipantId('')
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        className={cn(chromeIconButtonStyles, 'min-w-12 gap-1 px-1')}
        type="button"
        aria-label={`${t('participants.openList')} · ${t('participants.count', { count: onlineParticipants.length })}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setError('')
          setActionParticipantId('')
          setOpen((current) => !current)
        }}
      >
        <UsersIcon size={19} />
        <span className="font-mono text-xs tabular-nums text-ink">
          {onlineParticipants.length}
        </span>
      </button>

      {open && (
        <div
          className="fixed top-[68px] right-3 z-40 w-[min(320px,calc(100vw-24px))] rounded-xl border border-line bg-[#15121b] p-2 shadow-[0_16px_40px_rgba(0,0,0,.4)] sm:absolute sm:top-full sm:right-0 sm:mt-2"
          role="dialog"
          aria-label={t('participants.title')}
        >
          <div className="mb-1 flex items-center gap-1.5 border-b border-line px-2 pt-1.5 pb-2.5">
            <h2 className="m-0 text-sm font-semibold tracking-[-0.02em]">
              {t('participants.title')}
            </h2>
            <span className="font-mono text-[11px] text-muted">
              · {t('participants.count', { count: listedParticipants.length })}
            </span>
          </div>

          <ul className="m-0 flex max-h-[320px] list-none flex-col gap-0.5 overflow-y-auto p-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {listedParticipants.map((roomParticipant, index) => {
              const isCurrent = roomParticipant.id === currentParticipantId
              const canSetManager = Boolean(onSetManager && roomParticipant.isMember)
              const hasActions = !roomParticipant.isOwner && !isCurrent && (canSetManager || Boolean(onDisconnect && roomParticipant.online))
              return (
                <li
                  className={cn('rounded-md px-2 py-1.5 transition-colors hover:bg-white/[0.025] focus-within:bg-white/[0.025]', !roomParticipant.online && 'opacity-70', index === onlineParticipants.length && onlineParticipants.length > 0 && offlineMembers.length > 0 && 'mt-1 border-t border-line pt-2')}
                  key={roomParticipant.id}
                >
                  <div className="flex min-h-9 items-center gap-2.5">
                    <span className="relative size-8 shrink-0">
                      <span className="grid size-full place-items-center overflow-hidden rounded-full border border-purple/25 bg-purple/[0.08] text-xs font-bold text-purple-light">
                        {roomParticipant.avatarUrl ? (
                          <img
                            className="size-full object-cover"
                            src={roomParticipant.avatarUrl}
                            alt=""
                          />
                        ) : (
                          roomParticipant.nickname.trim().slice(0, 1).toUpperCase()
                        )}
                      </span>
                      {roomParticipant.online ? (
                        <span
                          className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-lime ring-2 ring-[#15121b]"
                          role="img"
                          aria-label={t('participants.online')}
                          title={t('participants.online')}
                        />
                      ) : (
                        <span className="sr-only">{t('participants.offline')}</span>
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px]">
                          {roomParticipant.nickname}
                        </strong>
                        {(roomParticipant.isOwner || roomParticipant.isManager) && (
                          <span
                            className={cn('shrink-0 text-sm leading-none', !roomParticipant.isOwner && 'grayscale')}
                            role="img"
                            aria-label={t(roomParticipant.isOwner ? 'manager.hostBadge' : 'manager.badge')}
                            title={t(roomParticipant.isOwner ? 'manager.hostBadge' : 'manager.badge')}
                          >
                            👑
                          </span>
                        )}
                        {isCurrent && (
                          <span className="shrink-0 text-[10px] text-dim">
                            {t('participants.you')}
                          </span>
                        )}
                      </div>
                    </div>
                    {hasActions && (
                      <button
                        className={cn(
                          'grid size-8 shrink-0 place-items-center rounded-lg border border-transparent text-lg leading-none text-muted',
                          'hover:border-line hover:bg-white/[0.06] hover:text-ink focus-visible:outline-2 focus-visible:outline-purple',
                        )}
                        type="button"
                        disabled={Boolean(busyParticipantId)}
                        aria-label={t('participants.actionsFor', { nickname: roomParticipant.nickname })}
                        aria-expanded={actionParticipantId === roomParticipant.id}
                        onClick={() => setActionParticipantId((current) => current === roomParticipant.id ? '' : roomParticipant.id)}
                      >
                        <span aria-hidden="true">···</span>
                      </button>
                    )}
                  </div>
                  {actionParticipantId === roomParticipant.id && hasActions && (
                    <div className="mt-2 grid gap-0.5 border-t border-line pt-2" role="group" aria-label={t('participants.actionsFor', { nickname: roomParticipant.nickname })}>
                      {canSetManager && <button className="rounded-lg px-2 py-2 text-left text-xs text-lime hover:bg-lime/[0.08] disabled:opacity-50" type="button" disabled={Boolean(busyParticipantId)} onClick={() => void setManager(roomParticipant)}>{roomParticipant.isManager ? t('manager.removeButton') : t('manager.addButton')}</button>}
                      {onDisconnect && roomParticipant.online && <button className="rounded-lg px-2 py-2 text-left text-xs text-muted hover:bg-white/[0.06] hover:text-ink disabled:opacity-50" type="button" disabled={Boolean(busyParticipantId)} onClick={() => void disconnect(roomParticipant)}>{t('participants.disconnect')}</button>}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>

          {(onLeave || onJoinAccount) && (
            <div className="mt-2 border-t border-line pt-2">
              {onJoinAccount && <button className="w-full rounded-lg px-3 py-2 text-left text-xs text-purple-light hover:bg-purple/[0.08]" type="button" onClick={() => void onJoinAccount()}>{t('participants.joinAccount')}</button>}
              {onLeave && <button className="w-full rounded-lg px-3 py-2 text-left text-xs text-muted hover:bg-danger/[0.08] hover:text-danger" type="button" onClick={() => void onLeave()}>{t('home.leaveRoom')}</button>}
            </div>
          )}

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
