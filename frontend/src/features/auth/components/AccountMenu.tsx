import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { CircleUserRound as UserCircleIcon, LogOut as LogoutIcon } from 'lucide-react'
import { SiDiscord as DiscordIcon } from 'react-icons/si'
import { useAuth } from '../context'
import { getErrorMessage, useI18n } from '../../../shared/i18n/i18n-context'
import { buttonStyles, chromeIconButtonStyles, cn } from '../../../shared/styles'

export function AccountMenu({
  compact = false,
  logoutConfirmMessage,
  menuPlacement = 'header',
}: {
  compact?: boolean
  logoutConfirmMessage?: string
  menuPlacement?: 'header' | 'above'
}) {
  const { enabled, loading, user, loginUrl, logout } = useAuth()
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    function closeOnOutsideClick(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
  }, [open])

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])
    if (!items.length) return
    event.preventDefault()
    const index = items.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
    items[next]?.focus()
  }

  if (loading || !enabled) return null

  if (!user) {
    return (
      <a
        className={cn(
          compact ? chromeIconButtonStyles : buttonStyles({ intent: 'outline', size: 'sm' }),
          compact && 'size-9 sm:w-auto sm:px-2',
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
    if (logoutConfirmMessage && !window.confirm(logoutConfirmMessage)) return
    setLoggingOut(true)
    setLogoutError('')
    try {
      await logout()
      setOpen(false)
    } catch (error) {
      setLogoutError(getErrorMessage(error, t))
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <div className="relative flex min-w-0 items-center gap-2.5" ref={containerRef}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
    >
      <button
        ref={triggerRef}
        className={cn(
          'grid size-10 shrink-0 place-items-center rounded-full transition-shadow',
          'hover:ring-2 hover:ring-purple/30 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-purple-light',
          open && 'ring-2 ring-purple/50',
        )}
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        aria-label={t('auth.accountMenu')}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setOpen(true)
          }
        }}
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

      {open && (
        <div
          id={menuId}
          ref={menuRef}
          className={cn(
            'w-[min(240px,calc(100vw-40px))] overflow-hidden rounded-2xl',
            menuPlacement === 'above'
              ? 'absolute right-0 bottom-[calc(100%+10px)] z-[90]'
              : 'fixed top-[72px] right-5 z-[80] sm:absolute sm:top-[calc(100%+10px)] sm:right-0',
            'border border-white/[0.12] bg-[#17141e] p-1.5 shadow-[0_12px_36px_rgba(0,0,0,.35)]',
          )}
          role="menu"
          aria-label={t('auth.accountMenu')}
          onKeyDown={handleMenuKeyDown}
        >
          <div className="mx-1 mb-1 flex items-center gap-3 border-b border-white/[0.08] px-2 py-3">
              {user.avatarUrl ? (
                <img
                  className="size-9 shrink-0 rounded-full bg-white/[0.04] object-cover"
                  src={user.avatarUrl}
                  alt=""
                />
              ) : (
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#5865f2] text-sm font-bold text-white">
                  {user.displayName.slice(0, 1).toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <strong className="block truncate text-sm font-semibold text-ink" title={user.displayName}>
                  {user.displayName}
                </strong>
                <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted"><DiscordIcon size={12} />Discord</span>
              </div>
          </div>

          <div className="grid gap-0.5">
            <button
              className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-ink transition-colors hover:bg-white/[0.06] focus-visible:bg-white/[0.06] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-purple-light"
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false)
                triggerRef.current?.focus()
              }}
            >
              <UserCircleIcon className="shrink-0 text-muted" size={18} />
              <span className="flex-1">{t('auth.editProfile')}</span>
            </button>

          <button
            className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-[#ed9ba7] transition-colors hover:bg-danger/[0.08] focus-visible:bg-danger/[0.08] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-danger disabled:cursor-wait disabled:opacity-50"
            disabled={loggingOut}
            role="menuitem"
            type="button"
            onClick={() => void handleLogout()}
          >
            <LogoutIcon className="shrink-0" size={18} />
            <span className="flex-1">
              {loggingOut ? t('auth.loggingOut') : t('auth.logout')}
            </span>
          </button>
          </div>
          {logoutError && <p className="m-2 text-xs text-danger" role="alert">{logoutError}</p>}
        </div>
      )}
    </div>
  )
}
