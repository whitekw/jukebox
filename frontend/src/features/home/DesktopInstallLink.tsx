import { useI18n } from '../../shared/i18n/i18n-context'
import { buttonStyles, cn } from '../../shared/styles'

const installerUrl = 'https://github.com/whitekw/jukebox/releases/download/v0.1.0/B-SIDE-0.1.0-Setup-x64.exe'

export function DesktopInstallLink() {
  const { t } = useI18n()

  if ('bsideDesktop' in window || !/Windows NT/i.test(navigator.userAgent)) return null

  return (
    <a
      className={cn(buttonStyles({ intent: 'outline', size: 'sm' }), 'hidden whitespace-nowrap md:inline-flex')}
      href={installerUrl}
      aria-label={t('home.installWindowsApp')}
    >
      {t('home.installWindowsApp')}
    </a>
  )
}
