import { Link } from 'react-router-dom'
import { useI18n } from '../i18n/i18n-context'
import { cn } from '../styles'

export function Brand({
  compact = false,
  compactOnMobile = false,
  className,
}: {
  compact?: boolean
  compactOnMobile?: boolean
  className?: string
}) {
  const { t } = useI18n()

  return (
    <Link
      className={cn(
        'inline-flex items-center gap-3 text-lg font-black tracking-[0.18em] text-ink',
        compactOnMobile && 'gap-0 md:gap-3',
        className,
      )}
      to="/"
      aria-label={`B-SIDE · ${t('common.home')}`}
    >
      <svg
        className="size-7 shrink-0 text-purple-light"
        viewBox="0 0 64 64"
        fill="currentColor"
        aria-hidden="true"
        focusable="false"
      >
        <rect x="7" y="24" width="6" height="16" rx="3" />
        <rect x="18" y="15" width="6" height="34" rx="3" />
        <rect x="29" y="8" width="6" height="48" rx="3" />
        <rect x="40" y="15" width="6" height="34" rx="3" />
        <rect x="51" y="24" width="6" height="16" rx="3" />
      </svg>
      <span
        className={cn(
          compact && 'sr-only',
          compactOnMobile && 'sr-only md:not-sr-only',
        )}
      >
        B-SIDE
      </span>
    </Link>
  )
}
