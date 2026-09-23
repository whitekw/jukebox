import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth'
import { useI18n } from '../i18n-context'
import { buttonStyles, cn } from '../styles'
import {
  ArrowUpRightIcon,
  DiscordIcon,
  LogoutIcon,
  UserCircleIcon,
} from './Icons'

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

      {open && (
        <div
          className={cn(
            'absolute top-[calc(100%+12px)] right-0 z-[80] w-[min(290px,calc(100vw-24px))] overflow-hidden rounded-[22px]',
            'border border-purple/25 bg-[#17141e]/98 shadow-[0_28px_90px_rgba(0,0,0,.58),inset_0_1px_0_rgba(255,255,255,.05)] backdrop-blur-2xl',
          )}
          role="menu"
        >
          <div className="relative overflow-hidden border-b border-white/[0.08] p-5">
            <div className="pointer-events-none absolute -top-14 -right-10 size-32 rounded-full bg-purple/[0.10] blur-2xl" />
            <span className="relative text-[9px] font-black tracking-[0.18em] text-purple-light">
              ACCOUNT
            </span>
            <div className="relative mt-3 flex items-center gap-3.5">
              {user.avatarUrl ? (
                <img
                  className="size-14 shrink-0 rounded-full border border-purple/50 object-cover shadow-[0_0_0_4px_rgba(155,123,255,.09)]"
                  src={user.avatarUrl}
                  alt=""
                />
              ) : (
                <span className="grid size-14 shrink-0 place-items-center rounded-full border border-purple/50 bg-[#5865f2] text-lg font-black text-white shadow-[0_0_0_4px_rgba(155,123,255,.09)]">
                  {user.displayName.slice(0, 1).toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <strong className="block truncate text-[17px] tracking-[-0.02em] text-ink">
                  {user.displayName}
                </strong>
              </div>
            </div>
          </div>

          <div className="grid gap-1 p-2.5">
            <button
              className="group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-bold text-muted transition-colors hover:bg-purple/[0.09] hover:text-ink"
              role="menuitem"
              type="button"
              onClick={() => setOpen(false)}
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.035] text-purple-light transition-colors group-hover:border-purple/30">
                <UserCircleIcon size={16} />
              </span>
              <span className="flex-1">{t('auth.editProfile')}</span>
              <ArrowUpRightIcon className="text-dim" size={17} />
            </button>

            <div className="mx-3 my-1 h-px bg-white/[0.07]" />

          <button
            className="group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-bold text-[#ff9aa8] transition-colors hover:bg-danger/[0.10] hover:text-[#ffc0ca] disabled:cursor-wait disabled:opacity-50"
            disabled={loggingOut}
            role="menuitem"
            type="button"
            onClick={() => void handleLogout()}
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-danger/20 bg-danger/[0.06]">
              <LogoutIcon size={16} />
            </span>
            <span className="flex-1">
              {loggingOut ? t('auth.loggingOut') : t('auth.logout')}
            </span>
          </button>
          </div>
        </div>
      )}
    </div>
  )
}
