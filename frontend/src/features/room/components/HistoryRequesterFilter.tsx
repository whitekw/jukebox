import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, UsersRound } from 'lucide-react'
import { useI18n } from '../../../shared/i18n/i18n-context'
import { cn } from '../../../shared/styles'
import type { RoomHistoryPage, RoomParticipant } from '../types'

type Requester = RoomHistoryPage['requesters'][number]

export function HistoryRequesterFilter({ requesters, participants, currentParticipantId, selectedIds, onChange }: {
  requesters: Requester[]
  participants: RoomParticipant[]
  currentParticipantId?: string
  selectedIds: string[]
  onChange: (ids: string[]) => void
}) {
  const { t } = useI18n()
  const menuId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0, width: 320, maxHeight: 340 })
  const listedRequesters = useMemo(() => {
    const historyById = new Map(requesters.map((requester) => [requester.id, requester]))
    const current = participants.map((participant) => ({
      id: participant.id,
      nickname: participant.nickname,
      avatarUrl: participant.avatarUrl,
      plays: historyById.get(participant.id)?.plays ?? 0,
    }))
    return [...current, ...requesters.filter((requester) => !participants.some((person) => person.id === requester.id))]
  }, [participants, requesters])
  const selectedName = selectedIds.length === 1
    ? listedRequesters.find((requester) => requester.id === selectedIds[0])?.nickname
    : null
  const selectionLabel = selectedIds.length === 0 ? t('history.allRequesters')
    : selectedName ?? t('history.selectedCount', { count: selectedIds.length })

  const updatePosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const width = Math.min(320, window.innerWidth - 24)
    const below = window.innerHeight - rect.bottom - 12
    const above = rect.top - 12
    const placeBelow = below >= 220 || below >= above
    const maxHeight = Math.min(340, Math.max(100, placeBelow ? below : above))
    setPosition({
      top: placeBelow ? rect.bottom + 8 : Math.max(8, rect.top - maxHeight - 8),
      left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      width,
      maxHeight,
    })
  }, [])

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false)
    }
    updatePosition()
    menuRef.current?.querySelector('button')?.focus({ preventScroll: true })
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open, updatePosition])

  function closeOnEscape(event: React.KeyboardEvent) {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    setOpen(false)
    triggerRef.current?.focus({ preventScroll: true })
  }

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((selected) => selected !== id) : [...selectedIds, id])
  }

  return <>
    <button ref={triggerRef} type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls={menuId}
      aria-label={`${t('history.filterRequester')} · ${selectionLabel}`}
      onKeyDown={closeOnEscape} onClick={() => { updatePosition(); setOpen((current) => !current) }}
      className={cn('inline-flex h-10 max-w-full items-center gap-2 rounded-lg border px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-purple-light',
        open || selectedIds.length ? 'border-purple/50 bg-purple/10 text-ink' : 'border-line bg-panel text-ink hover:border-purple/40 hover:bg-white/[0.055]')}>
      <UsersRound size={16} className="shrink-0 text-purple-light" aria-hidden="true" />
      <span className="shrink-0 font-semibold">{t('history.filterRequester')}</span>
      <span className="truncate text-muted">· {selectionLabel}</span>
      <ChevronDown size={15} className={cn('ml-1 shrink-0 text-muted transition-transform', open && 'rotate-180')} aria-hidden="true" />
    </button>
    {open && createPortal(<div ref={menuRef} id={menuId} role="dialog" aria-label={t('history.filterRequester')}
      onKeyDown={closeOnEscape} style={position}
      className="fixed z-[100] flex flex-col overflow-hidden rounded-xl border border-line bg-[#15121b] p-2 shadow-[0_16px_40px_rgba(0,0,0,.4)]">
      <div className="mb-1 flex shrink-0 items-center gap-1.5 border-b border-line px-2 pt-1.5 pb-2.5">
        <h3 className="m-0 text-sm font-semibold tracking-[-0.02em]">{t('history.filterRequester')}</h3>
        <span className="font-mono text-[11px] text-muted">· {t('participants.count', { count: listedRequesters.length })}</span>
      </div>
      <div className="min-h-0 overflow-y-auto [scrollbar-width:thin]">
        <button type="button" role="checkbox" aria-checked={selectedIds.length === 0}
          onClick={() => onChange([])}
          className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-white/[0.045] focus-visible:outline-2 focus-visible:outline-purple-light">
          <span className="grid size-8 shrink-0 place-items-center rounded-full border border-purple/25 bg-purple/[0.08] text-purple-light"><UsersRound size={15} aria-hidden="true" /></span>
          <span className="min-w-0 flex-1 font-semibold">{t('history.allRequesters')}</span>
          {selectedIds.length === 0 && <Check size={17} className="shrink-0 text-purple-light" aria-hidden="true" />}
        </button>
        {listedRequesters.map((requester) => {
          const participant = participants.find((person) => person.id === requester.id)
          const selected = selectedIds.includes(requester.id)
          return <button key={requester.id} type="button" role="checkbox" aria-checked={selected}
            onClick={() => toggle(requester.id)}
            className={cn('flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.045] focus-visible:outline-2 focus-visible:outline-purple-light',
              selected && 'bg-purple/[0.09]')}>
            <span className="relative size-8 shrink-0">
              <span className="grid size-full place-items-center overflow-hidden rounded-full border border-purple/25 bg-purple/[0.08] text-xs font-bold text-purple-light">
                {requester.avatarUrl ? <img src={requester.avatarUrl} alt="" className="size-full object-cover" />
                  : requester.nickname.trim().slice(0, 1).toUpperCase()}
              </span>
              {participant?.online && <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-lime ring-2 ring-[#15121b]" aria-label={t('participants.online')} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-1.5">
                <strong className="truncate text-[13px]">{requester.nickname}</strong>
                {listedRequesters.some((other) => other.id !== requester.id && other.nickname === requester.nickname) &&
                  <span className="shrink-0 font-mono text-[10px] text-dim">#{requester.id.slice(0, 6)}</span>}
                {(participant?.isOwner || participant?.isManager) && <span className={cn('shrink-0 text-sm leading-none', !participant.isOwner && 'grayscale')}
                  role="img" aria-label={t(participant.isOwner ? 'manager.hostBadge' : 'manager.badge')}>👑</span>}
                {requester.id === currentParticipantId && <span className="shrink-0 text-[10px] text-dim">{t('participants.you')}</span>}
              </span>
              <span className="block text-[11px] text-muted">{t('history.playCount', { count: requester.plays })}</span>
            </span>
            {selected && <Check size={17} className="shrink-0 text-purple-light" aria-hidden="true" />}
          </button>
        })}
      </div>
    </div>, document.body)}
  </>
}
