import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Settings, X as CloseIcon } from 'lucide-react'
import { getErrorMessage, useI18n } from '../../../shared/i18n/i18n-context'
import { buttonStyles, cn, formControlStyles } from '../../../shared/styles'
import type { RoomState } from '../types'

export function RoomSettingsButton({ room, onSave }: {
  room: RoomState
  onSave: (title: string, allowGuests: boolean) => Promise<void>
}) {
  const { t } = useI18n()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(room.title)
  const [allowGuests, setAllowGuests] = useState(room.allowGuests)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const dialog = dialogRef.current
    if (!open || !dialog) return
    dialog.showModal()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      dialog.close()
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    try {
      await onSave(title, allowGuests)
      dialogRef.current?.close()
    } catch (requestError) {
      setError(getErrorMessage(requestError, t))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        className={cn(buttonStyles({ intent: 'outline', size: 'sm' }), 'size-10 bg-transparent px-0')}
        type="button"
        aria-label={t('roomSettings.open')}
        aria-haspopup="dialog"
        onClick={() => {
          setTitle(room.title)
          setAllowGuests(room.allowGuests)
          setError('')
          setOpen(true)
        }}
      >
        <Settings size={18} strokeWidth={2} aria-hidden="true" />
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={() => { setOpen(false); triggerRef.current?.focus() }}
        onClick={(event) => {
          if (event.target === event.currentTarget && !saving) event.currentTarget.close()
        }}
        className="fixed inset-0 m-auto max-h-[calc(100dvh-32px)] w-[min(440px,calc(100vw-32px))] overflow-y-auto rounded-[18px] border border-line bg-[#17141e] p-6 text-ink shadow-[0_24px_80px_rgba(0,0,0,.4)] backdrop:bg-black/65 backdrop:backdrop-blur-sm"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-xl font-bold tracking-[-0.03em]">{t('roomSettings.heading')}</h2>
            <p className="mt-1 text-xs font-mono text-muted">ROOM · {room.code}</p>
          </div>
          <button className={cn(buttonStyles({ intent: 'outline', size: 'sm' }), 'size-8 shrink-0 px-0')} type="button" aria-label={t('common.close')} disabled={saving} onClick={() => dialogRef.current?.close()}>
            <CloseIcon size={16} />
          </button>
        </div>
        <form className="mt-6" onSubmit={(event) => void submit(event)}>
          <label className="mb-2 block text-sm font-semibold" htmlFor={`${titleId}-room-title`}>{t('roomSettings.titleLabel')}</label>
          <input className={formControlStyles({ size: 'large' })} id={`${titleId}-room-title`} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={60} placeholder={room.code} disabled={saving} />
          <p className="mt-2 text-xs leading-5 text-muted">{t('roomSettings.titleHint')}</p>
          <label className="mt-6 flex cursor-pointer items-start gap-3 border-t border-line pt-5">
            <input className="mt-0.5 size-[18px] shrink-0 accent-purple-light" type="checkbox" checked={allowGuests} onChange={(event) => setAllowGuests(event.target.checked)} disabled={saving} />
            <span><strong className="block text-sm">{t('roomSettings.allowGuestsLabel')}</strong><span className="mt-1 block text-xs leading-5 text-muted">{t('roomSettings.allowGuestsHint')}</span></span>
          </label>
          {error && <p className="mt-5 text-sm text-danger" role="alert">{error}</p>}
          <button className={cn(buttonStyles({ intent: 'primary', size: 'md', fullWidth: true }), 'mt-7')} type="submit" disabled={saving}>
            {saving ? t('roomSettings.saving') : t('roomSettings.save')}
          </button>
        </form>
      </dialog>
    </>
  )
}
