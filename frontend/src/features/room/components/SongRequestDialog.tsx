import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'
import { useI18n } from '../../../shared/i18n/i18n-context'
import { panelCloseButtonStyles } from '../../../shared/styles'
import { SearchPanel } from './SearchPanel'

export function SongRequestDialog({ open, onClose, onAddSong, message, error }: {
  open: boolean
  onClose: () => void
  onAddSong: (videoId: string) => Promise<void>
  message: string
  error: string
}) {
  const { t } = useI18n()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!open || !dialog) return
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.show()
    dialog.querySelector('input')?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing ||
        document.querySelector('dialog:modal')) return
      event.preventDefault()
      dialog.close()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      const restoreFocus = dialog.contains(document.activeElement)
      dialog.close()
      if (restoreFocus) trigger?.focus()
    }
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      className="absolute inset-0 z-20 m-0 h-full max-h-none w-full max-w-none overflow-hidden border-0 bg-canvas p-0 text-ink"
    >
      <div className="flex h-full min-h-0 flex-col p-4 sm:p-6">
        <div className="mb-5 flex shrink-0 items-start justify-between gap-3">
          <h2 id={titleId} className="text-xl font-bold">{t('search.requestSong')}</h2>
          <button
            className={panelCloseButtonStyles}
            type="button"
            aria-label={t('common.close')}
            onClick={() => dialogRef.current?.close()}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <SearchPanel className="min-h-0 flex-1" onAddSong={onAddSong} />
        {error && <p className="mt-3 shrink-0 text-sm text-danger" role="alert">{error}</p>}
        {message && !error && <p className="mt-3 shrink-0 text-sm text-lime" role="status">{message}</p>}
      </div>
    </dialog>
  )
}
