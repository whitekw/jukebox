import { request } from '../../shared/http'

export const latestDesktopReleaseUrl = 'https://github.com/whitekw/jukebox/releases/latest'

const latestReleaseApiUrl = 'https://api.github.com/repos/whitekw/jukebox/releases/latest'

type GitHubRelease = {
  assets?: Array<{ name: string; browser_download_url: string }>
}

export async function getLatestDesktopInstallerUrl() {
  const release = await request<GitHubRelease>(latestReleaseApiUrl, {
    headers: { Accept: 'application/vnd.github+json' },
  })
  const installer = release.assets?.find((asset) =>
    /^B-SIDE-[\d.]+-Setup-x64\.exe$/.test(asset.name)
    && asset.browser_download_url.startsWith('https://github.com/whitekw/jukebox/releases/download/'),
  )
  if (!installer) throw new Error('Latest release has no Windows installer')
  return installer.browser_download_url
}
