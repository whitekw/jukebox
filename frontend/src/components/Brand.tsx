import { Link } from 'react-router-dom'
import { useI18n } from '../i18n-context'
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
      aria-label={`Jukebox · ${t('common.home')}`}
    >
      <span
        className="flex size-6 items-end gap-[3px] rounded-[7px] border border-lime/45 bg-lime/[0.08] p-[5px]"
        aria-hidden="true"
      >
        <span className="h-[7px] w-[3px] rounded-[3px] bg-lime" />
        <span className="h-[13px] w-[3px] rounded-[3px] bg-lime" />
        <span className="h-[10px] w-[3px] rounded-[3px] bg-lime" />
      </span>
      <span
        className={cn(
          compact && 'sr-only',
          compactOnMobile && 'sr-only md:not-sr-only',
        )}
      >
        JUKEBOX
      </span>
    </Link>
  )
}
