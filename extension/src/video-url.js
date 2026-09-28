const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/

export function extractYouTubeVideoId(input) {
  let url
  try {
    url = new URL(input)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  const parts = url.pathname.split('/').filter(Boolean)
  let videoId = null
  if (host === 'youtu.be') videoId = parts[0]
  if (['youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
    if (url.pathname === '/watch') videoId = url.searchParams.get('v')
    if (['shorts', 'live'].includes(parts[0])) videoId = parts[1]
  }
  return VIDEO_ID_PATTERN.test(videoId ?? '') ? videoId : null
}
