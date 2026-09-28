import { useState, type MouseEvent } from 'react'
import { useI18n } from '../../shared/i18n/i18n-context'
import { buttonStyles, cn } from '../../shared/styles'
import { getLatestDesktopInstallerUrl, latestDesktopReleaseUrl } from './api'

export function DesktopInstallLink() {
  const { t } = useI18n()
  const [resolving, setResolving] = useState(false)

  if ('bsideDesktop' in window || !/Windows NT/i.test(navigator.userAgent)) return null

  async function installLatest(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault()
    if (resolving) return
    setResolving(true)
    try {
      window.location.assign(await getLatestDesktopInstallerUrl())
    } catch {
      window.location.assign(latestDesktopReleaseUrl)
    } finally {
      setResolving(false)
    }
  }

  return (
    <a
      className={cn(buttonStyles({ intent: 'outline', size: 'sm' }), 'hidden whitespace-nowrap md:inline-flex')}
      href={latestDesktopReleaseUrl}
      aria-label={t('home.installWindowsApp')}
      aria-busy={resolving}
      onClick={(event) => void installLatest(event)}
    >
      {t('home.installWindowsApp')}
    </a>
  )
}
