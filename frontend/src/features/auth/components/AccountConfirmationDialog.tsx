import { useEffect, useId, useRef } from 'react'
import { useI18n } from '../../../shared/i18n/i18n-context'
import { buttonStyles, cn } from '../../../shared/styles'

export type AccountConfirmation = { message: string; label: string; danger?: boolean; onConfirm: () => void }

export function AccountConfirmationDialog({ confirmation, onClose }: { confirmation: AccountConfirmation; onClose: () => void }) {
  const { t } = useI18n()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.showModal()
    return () => { dialog.close(); trigger?.focus({ preventScroll: true }) }
  }, [])
  return <dialog ref={dialogRef} aria-labelledby={titleId} aria-describedby={descriptionId}
    onCancel={event => { event.preventDefault(); onClose() }}
    className="fixed inset-0 m-auto w-[min(440px,calc(100vw-32px))] rounded-2xl border border-line bg-panel p-5 text-ink shadow-xl backdrop:bg-black/65">
    <h2 id={titleId} className="text-lg font-bold">{confirmation.label}</h2>
    <p id={descriptionId} className="mt-3 text-sm leading-6 text-muted">{confirmation.message}</p>
    <div className="mt-5 flex justify-end gap-2">
      <button type="button" autoFocus className={buttonStyles({ size: 'sm' })} onClick={onClose}>{t('common.cancel')}</button>
      <button type="button" className={cn(buttonStyles({ intent: 'primary', size: 'sm' }), confirmation.danger && 'bg-danger text-white hover:bg-danger/80')}
        onClick={() => { onClose(); confirmation.onConfirm() }}>{confirmation.label}</button>
    </div>
  </dialog>
}
