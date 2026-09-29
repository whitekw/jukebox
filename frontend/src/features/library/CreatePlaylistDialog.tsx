import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { getErrorMessage, useI18n } from '../../shared/i18n/i18n-context'
import { buttonStyles, cn } from '../../shared/styles'
import { libraryApi, type Playlist } from './api'

export function CreatePlaylistDialog({ onClose, onCreated }: {
  onClose: () => void
  onCreated: (playlist: Playlist) => void
}) {
  const { t } = useI18n()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.showModal()
    return () => {
      const restoreFocus = dialog.contains(document.activeElement)
      dialog.close()
      if (restoreFocus) trigger?.focus()
    }
  }, [])

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || !name.trim()) return
    setSaving(true)
    setError('')
    try {
      onCreated(await libraryApi.create(name))
    } catch (cause) {
      setError(getErrorMessage(cause, t))
      setSaving(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); if (!saving) onClose() }}
      onClick={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}
      className="fixed inset-0 m-auto w-[min(400px,calc(100vw-32px))] rounded-2xl border border-line bg-[#1b1921] p-0 text-ink shadow-[0_24px_80px_rgba(0,0,0,.55)] backdrop:bg-black/65 backdrop:backdrop-blur-sm"
    >
      <form onSubmit={(event) => void create(event)}>
        <div className="flex items-center justify-between gap-3 px-5 pt-5">
          <h2 id={titleId} className="m-0 text-lg font-bold">{t('library.newPlaylist')}</h2>
          <button type="button" disabled={saving} className={cn(buttonStyles({ intent: 'outline', size: 'sm' }), 'size-8 px-0')} aria-label={t('common.close')} onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="px-5 py-5">
          <label className="mb-2 block text-sm font-semibold" htmlFor={`${titleId}-name`}>{t('library.newName')}</label>
          <input
            id={`${titleId}-name`}
            autoFocus
            maxLength={60}
            disabled={saving}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('library.newName')}
            className="h-11 w-full rounded-lg border border-line bg-white/5 px-3 text-sm text-ink outline-none focus:border-purple-light"
          />
          {error && <p role="alert" className="mb-0 text-sm text-danger">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <button type="button" disabled={saving} onClick={onClose} className={buttonStyles({ intent: 'outline', size: 'sm' })}>{t('common.cancel')}</button>
          <button type="submit" disabled={saving || !name.trim()} className={buttonStyles({ intent: 'primary', size: 'sm' })}>{t('library.create')}</button>
        </div>
      </form>
    </dialog>
  )
}
