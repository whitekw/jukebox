import { useI18n, type Locale } from '../i18n-context'
import { cn } from '../styles'

const localeNames: Record<Locale, string> = {
  ko: '한국어',
  ja: '日本語',
  en: 'English',
}

export function LocaleSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n()

  return (
    <select
      className={cn(
        'h-9 max-w-[104px] rounded-lg border border-line bg-panel px-2 text-xs font-bold text-muted outline-none',
        'focus:border-purple/65 focus:ring-2 focus:ring-purple/20 md:max-w-none md:px-2.5',
        className,
      )}
      aria-label={t('language.selectorLabel')}
      value={locale}
      onChange={(event) => setLocale(event.target.value as Locale)}
    >
      {(Object.keys(localeNames) as Locale[]).map((value) => (
        <option key={value} value={value}>
          {localeNames[value]}
        </option>
      ))}
    </select>
  )
}
