import { useState, type MouseEvent } from 'react'
import { useI18n } from '../../shared/i18n/i18n-context'
import { buttonStyles, cn } from '../../shared/styles'

const latestReleaseUrl = 'https://github.com/whitekw/jukebox/releases/latest'
const latestReleaseApiUrl = 'https://api.github.com/repos/whitekw/jukebox/releases/latest'

export function DesktopInstallLink() {
  const { t } = useI18n()
  const [resolving, setResolving] = useState(false)

  if ('bsideDesktop' in window || !/Windows NT/i.test(navigator.userAgent)) return null

  async function installLatest(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault()
    if (resolving) return
    setResolving(true)
    try {
      const response = await fetch(latestReleaseApiUrl, {
        headers: { Accept: 'application/vnd.github+json' },
      })
      if (!response.ok) throw new Error('Could not load latest release')

      const release = await response.json() as {
        assets?: Array<{ name: string; browser_download_url: string }>
      }
      const installer = release.assets?.find((asset) =>
        /^B-SIDE-[\d.]+-Setup-x64\.exe$/.test(asset.name)
        && asset.browser_download_url.startsWith('https://github.com/whitekw/jukebox/releases/download/'),
      )
      window.location.assign(installer?.browser_download_url ?? latestReleaseUrl)
    } catch {
      window.location.assign(latestReleaseUrl)
    } finally {
      setResolving(false)
    }
  }

  return (
    <a
      className={cn(buttonStyles({ intent: 'outline', size: 'sm' }), 'hidden whitespace-nowrap md:inline-flex')}
      href={latestReleaseUrl}
      aria-label={t('home.installWindowsApp')}
      aria-busy={resolving}
      onClick={(event) => void installLatest(event)}
    >
      {t('home.installWindowsApp')}
    </a>
  )
}
