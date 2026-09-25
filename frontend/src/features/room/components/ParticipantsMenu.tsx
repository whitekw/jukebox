import { useEffect, useRef, useState } from 'react'
import { UsersIcon } from '../../../shared/ui/Icons'
import { getErrorMessage, useI18n } from '../../../shared/i18n/i18n-context'
import { cn } from '../../../shared/styles'
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
    if (!onSetManager || busyParticipantId) return
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
        className={cn(
          'inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] border border-line bg-transparent px-3 text-sm text-muted',
          'transition-colors hover:border-purple/50 hover:bg-purple/[0.08] hover:text-ink',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple',
        )}
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
          className="fixed top-[68px] right-3 z-40 w-[min(320px,calc(100vw-24px))] rounded-2xl border border-line bg-[#15121b] p-3 shadow-[0_24px_70px_rgba(0,0,0,.55)] sm:absolute sm:top-full sm:right-0 sm:mt-2"
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
              {t('participants.count', { count: onlineParticipants.length })}
            </span>
          </div>

          <ul className="m-0 flex max-h-[320px] list-none flex-col gap-1 overflow-y-auto p-0">
            {[...onlineParticipants, ...offlineMembers].map((roomParticipant, index) => {
              const isCurrent = roomParticipant.id === currentParticipantId
              const hasActions = !roomParticipant.isOwner && !isCurrent && Boolean(onSetManager || onDisconnect)
              return (
                <li
                  className={cn('rounded-xl px-2.5 py-2 transition-colors hover:bg-white/[0.04]', !roomParticipant.online && 'opacity-70', index === onlineParticipants.length && offlineMembers.length > 0 && 'mt-2 border-t border-line pt-3')}
                  key={roomParticipant.id}
                >
                  <div className="flex min-h-10 items-center gap-3">
                    <span className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-full border border-purple/25 bg-purple/[0.08] text-sm font-black text-purple-light">
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
                        <span className={cn('size-1.5 shrink-0 rounded-full', roomParticipant.online ? 'bg-lime' : 'bg-dim')} aria-label={roomParticipant.online ? t('participants.online') : t('participants.offline')} />
                      </div>
                      {(roomParticipant.isOwner || roomParticipant.isManager) && (
                        <span className="text-[10px] font-bold text-lime">
                          {t(roomParticipant.isOwner ? 'manager.hostBadge' : 'manager.badge')}
                        </span>
                      )}
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
                      {onSetManager && <button className="rounded-lg px-2 py-2 text-left text-xs text-lime hover:bg-lime/[0.08] disabled:opacity-50" type="button" disabled={Boolean(busyParticipantId)} onClick={() => void setManager(roomParticipant)}>{roomParticipant.isManager ? t('manager.removeButton') : t('manager.addButton')}</button>}
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
