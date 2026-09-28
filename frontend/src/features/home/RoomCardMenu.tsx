import { useEffect, useId, useRef, useState } from 'react'
import { Ellipsis as MoreHorizontalIcon, Trash2 as TrashIcon } from 'lucide-react'
import { useI18n } from '../../shared/i18n/i18n-context'

export function RoomCardMenu({ roomCode, disabled, onDelete }: {
  roomCode: string
  disabled: boolean
  onDelete: () => void
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const itemRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    itemRef.current?.focus()
    function closeOutside(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [open])

  return (
    <div
      ref={containerRef}
      className="absolute top-1 right-2"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault()
          event.stopPropagation()
          setOpen(false)
          triggerRef.current?.focus()
        }
      }}
    >
      <button
        ref={triggerRef}
        className="grid size-8 place-items-center rounded-lg text-dim transition-colors hover:bg-white/[0.06] hover:text-ink focus-visible:outline-2 focus-visible:outline-purple-light aria-expanded:bg-white/[0.06] aria-expanded:text-ink disabled:cursor-wait disabled:opacity-40"
        type="button"
        aria-label={t('home.roomMenu', { code: roomCode })}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            setOpen(true)
            itemRef.current?.focus()
          }
        }}
      >
        <MoreHorizontalIcon size={18} />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={t('home.roomMenu', { code: roomCode })}
          className="absolute top-[calc(100%+4px)] right-0 z-30 w-36 rounded-xl border border-white/[0.12] bg-[#17141e] p-1 shadow-[0_8px_24px_rgba(0,0,0,.35)]"
          onKeyDown={(event) => {
            if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
              event.preventDefault()
              itemRef.current?.focus()
            }
          }}
        >
          <button
            ref={itemRef}
            role="menuitem"
            type="button"
            disabled={disabled}
            className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-sm text-[#ed9ba7] transition-colors hover:bg-danger/[0.08] focus-visible:bg-danger/[0.08] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-danger disabled:opacity-40"
            onClick={() => {
              setOpen(false)
              triggerRef.current?.focus()
              onDelete()
            }}
          >
            <TrashIcon size={16} />
            {t('home.deleteRoom')}
          </button>
        </div>
      )}
    </div>
  )
}
