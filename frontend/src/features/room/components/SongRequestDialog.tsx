import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'
import { useI18n } from '../../../shared/i18n/i18n-context'
import { buttonStyles, cn } from '../../../shared/styles'
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
    dialog.showModal()
    dialog.querySelector('input')?.focus()
    return () => dialog.close()
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close()
      }}
      className="fixed inset-0 m-auto h-[min(640px,calc(100dvh-32px))] max-h-[calc(100dvh-32px)] w-[min(800px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-line bg-canvas p-0 text-ink shadow-[0_24px_80px_rgba(0,0,0,.4)] backdrop:bg-black/65 backdrop:backdrop-blur-sm"
    >
      <div className="flex h-full min-h-0 flex-col p-4 sm:p-6">
        <div className="mb-5 flex shrink-0 items-center justify-between gap-3">
          <h2 id={titleId} className="text-xl font-bold">{t('search.requestSong')}</h2>
          <button
            className={cn(buttonStyles({ intent: 'outline', size: 'sm' }), 'size-8 shrink-0 px-0')}
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
