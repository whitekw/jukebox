import { useEffect, useId, useRef, useState } from 'react'
import QRCode from 'react-qr-code'
import { Copy as CopyIcon, Share2 as ShareIcon, X as CloseIcon } from 'lucide-react'
import { useI18n } from '../../../shared/i18n/i18n-context'
import { buttonStyles, chromeIconButtonStyles, cn, panelCloseButtonStyles } from '../../../shared/styles'

export function InviteRoomButton({ code, joinUrl, allowGuests, triggerClassName }: { code: string; joinUrl: string; allowGuests: boolean; triggerClassName?: string }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()

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

  useEffect(() => {
    if (!copied) return
    const timeout = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timeout)
  }, [copied])

  async function copyLink() {
    setCopyFailed(false)
    try {
      await navigator.clipboard.writeText(joinUrl)
      setCopied(true)
    } catch {
      setCopyFailed(true)
    }
  }

  return (
    <>
      <button
        className={cn(chromeIconButtonStyles, triggerClassName)}
        type="button"
        aria-label={t('room.invite')}
        title={t('room.invite')}
        aria-haspopup="dialog"
        onClick={() => {
          setCopied(false)
          setCopyFailed(false)
          setOpen(true)
        }}
      >
        <ShareIcon size={19} aria-hidden="true" />
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close()
        }}
        className="fixed inset-0 m-auto max-h-[calc(100dvh-32px)] w-[min(380px,calc(100vw-32px))] overflow-y-auto rounded-[18px] border border-line bg-[#17141e] p-6 text-ink shadow-[0_24px_80px_rgba(0,0,0,.4)] backdrop:bg-black/65 backdrop:backdrop-blur-sm"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="pt-1 text-lg font-bold tracking-[-0.03em] [word-break:keep-all]">{t('room.inviteTitle')}</h2>
          <button className={cn(panelCloseButtonStyles, 'size-8')} type="button" aria-label={t('common.close')} onClick={() => dialogRef.current?.close()}>
            <CloseIcon size={16} />
          </button>
        </div>
        <p id={descriptionId} className="mt-2 text-sm leading-6 text-muted">{allowGuests ? t('home.guestHint') : t('roomSettings.loginRequiredHint')}</p>
        <div className="mx-auto mt-6 w-fit rounded-xl bg-white p-3">
          <QRCode value={joinUrl} size={144} title={t('room.inviteQr')} />
        </div>
        <p className="mt-4 text-center font-mono text-base tracking-[0.15em]">{code}</p>
        <label className="mt-5 block text-xs text-muted" htmlFor={`${titleId}-link`}>{t('room.inviteLink')}</label>
        <input id={`${titleId}-link`} className="mt-2 h-10 w-full rounded-lg border border-line bg-canvas px-3 text-xs text-muted focus-visible:outline-2 focus-visible:outline-purple-light" readOnly value={joinUrl} onFocus={(event) => event.currentTarget.select()} />
        <button className={cn(buttonStyles({ intent: 'primary', size: 'md', fullWidth: true }), 'mt-3 gap-2')} type="button" onClick={() => void copyLink()}>
          <CopyIcon size={16} />{copied ? t('host.linkCopied') : t('room.copyInviteLink')}
        </button>
        <span className="sr-only" role="status">{copied ? t('host.linkCopied') : ''}</span>
        {copyFailed && <p className="mt-3 text-xs leading-5 text-[#ff9cab]" role="alert">{t('room.copyLinkFailed')}</p>}
      </dialog>
    </>
  )
}
