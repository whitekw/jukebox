import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth'
import { useI18n } from '../i18n-context'
import { buttonStyles, cn } from '../styles'
import { DiscordIcon } from './Icons'

export function AccountMenu({ compact = false }: { compact?: boolean }) {
  const { enabled, loading, user, loginUrl, logout } = useAuth()
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function closeOnOutsideClick(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  if (loading || !enabled) return null

  if (!user) {
    return (
      <a
        className={cn(
          buttonStyles({ intent: 'outline', size: 'sm' }),
          compact && 'size-9 px-0 sm:w-auto sm:px-3',
        )}
        href={loginUrl()}
        aria-label={t('auth.loginWithDiscord')}
      >
        <DiscordIcon size={18} />
        <span className={compact ? 'hidden sm:inline' : ''}>
          {t('auth.login')}
        </span>
      </a>
    )
  }

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await logout()
      setOpen(false)
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <div className="relative flex min-w-0 items-center gap-2.5" ref={containerRef}>
      <button
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-full',
          'transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:opacity-70',
        )}
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t('auth.accountMenu')}
        onClick={() => setOpen((current) => !current)}
      >
        {user.avatarUrl ? (
          <img
            className="size-9 rounded-full object-cover"
            src={user.avatarUrl}
            alt=""
          />
        ) : (
          <span className="grid size-9 place-items-center rounded-full bg-[#5865f2] text-sm font-black text-white">
            {user.displayName.slice(0, 1).toUpperCase()}
          </span>
        )}
      </button>

      <span
        className={cn(
          'max-w-36 truncate text-sm font-bold text-ink',
          compact && 'hidden sm:block',
        )}
      >
        {user.displayName}
      </span>

      {open && (
        <div
          className="absolute top-[calc(100%+9px)] right-0 z-[80] w-40 rounded-xl border border-line bg-[#15121d]/98 p-1.5 shadow-[0_22px_70px_rgba(0,0,0,.5)] backdrop-blur-xl"
          role="menu"
        >
          <button
            className="w-full rounded-lg px-3 py-2.5 text-left text-xs font-bold text-muted transition-colors hover:bg-white/[0.07] hover:text-ink"
            role="menuitem"
            type="button"
          >
            {t('auth.editProfile')}
          </button>
          <button
            className="w-full rounded-lg px-3 py-2.5 text-left text-xs font-bold text-[#ff9aa8] transition-colors hover:bg-danger/15 hover:text-[#ffc0ca] disabled:opacity-50"
            disabled={loggingOut}
            role="menuitem"
            type="button"
            onClick={() => void handleLogout()}
          >
            {loggingOut ? t('auth.loggingOut') : t('auth.logout')}
          </button>
        </div>
      )}
    </div>
  )
}
