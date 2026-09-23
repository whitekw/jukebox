import { useEffect, useId, useRef } from 'react'
import { useAuth } from '../auth'
import { useI18n } from '../i18n-context'
import { buttonStyles, cn } from '../styles'
import { DiscordIcon } from './Icons'

export function LoginRequiredDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { enabled, loginUrl } = useAuth()
  const { t } = useI18n()
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

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close()
      }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-40px)] w-[min(420px,calc(100vw-40px))] overflow-y-auto rounded-[18px] border border-line bg-[#17141e] p-0 text-ink shadow-[0_24px_80px_rgba(0,0,0,.4)] backdrop:bg-black/65 backdrop:backdrop-blur-sm"
    >
      <div className="p-6 sm:p-7">
        <h2 id={titleId} className="text-xl leading-snug font-bold tracking-[-0.03em] [word-break:keep-all]">
          {t('createRoom.loginRequiredTitle')}
        </h2>
        <p id={descriptionId} className="mt-3 text-sm leading-6 text-muted [word-break:keep-all]">
          {enabled ? t('createRoom.loginRequiredDescription') : t('createRoom.authUnavailable')}
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button className={buttonStyles({ intent: 'outline', size: 'md' })} type="button" onClick={() => dialogRef.current?.close()}>
            {t('common.cancel')}
          </button>
          {enabled && (
            <a className={cn(buttonStyles({ intent: 'primary', size: 'md' }), 'gap-2')} href={loginUrl('/rooms/new')}>
              <DiscordIcon size={18} />{t('auth.loginWithDiscord')}
            </a>
          )}
        </div>
      </div>
    </dialog>
  )
}
