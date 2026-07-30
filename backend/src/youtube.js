const { AppError } = require('./errors')

const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/

function extractYouTubeVideoId(input) {
  const value = String(input ?? '').trim()
  if (VIDEO_ID_PATTERN.test(value)) return value

  let url
  try {
    url = new URL(value)
  } catch {
    return null
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, '')
  if (hostname === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0]
    return VIDEO_ID_PATTERN.test(id ?? '') ? id : null
  }

  if (!['youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(hostname)) {
    return null
  }

  const pathParts = url.pathname.split('/').filter(Boolean)
  const candidate =
    url.searchParams.get('v') ??
    (['shorts', 'embed', 'live'].includes(pathParts[0]) ? pathParts[1] : null)

  return VIDEO_ID_PATTERN.test(candidate ?? '') ? candidate : null
}

function parseIsoDuration(duration) {
  const match = String(duration).match(
    /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/,
  )
  if (!match) return 0
  const [, days = '0', hours = '0', minutes = '0', seconds = '0'] = match
  return (
    Number(days) * 86400 +
    Number(hours) * 3600 +
    Number(minutes) * 60 +
    Number(seconds)
  )
}

function createYouTubeService(apiKey, { fetchImpl = fetch } = {}) {
  const baseUrl = 'https://www.googleapis.com/youtube/v3'

  function assertConfigured() {
    if (!apiKey) {
      throw new AppError(
        503,
        'YouTube 검색을 사용하려면 백엔드의 YOUTUBE_API_KEY를 설정해주세요.',
        'YOUTUBE_NOT_CONFIGURED',
      )
    }
  }

  async function youtubeFetch(pathname, params) {
    assertConfigured()
    const url = new URL(`${baseUrl}/${pathname}`)
    Object.entries({ ...params, key: apiKey }).forEach(([key, value]) => {
      url.searchParams.set(key, String(value))
    })

    let response
    try {
      response = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) })
    } catch {
      throw new AppError(502, 'YouTube에 연결하지 못했습니다.', 'YOUTUBE_UNAVAILABLE')
    }

    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      const message = body?.error?.message ?? 'YouTube API 요청에 실패했습니다.'
      throw new AppError(response.status, message, 'YOUTUBE_API_ERROR')
    }
    return body
  }

  function mapVideo(item) {
    const thumbnail =
      item.snippet?.thumbnails?.medium?.url ??
      item.snippet?.thumbnails?.default?.url ??
      `https://i.ytimg.com/vi/${item.id}/mqdefault.jpg`

    return {
      videoId: item.id,
      title: item.snippet?.title ?? '제목 없음',
      artist: item.snippet?.channelTitle ?? '아티스트 정보 없음',
      durationSeconds: parseIsoDuration(item.contentDetails?.duration),
      thumbnailUrl: thumbnail,
    }
  }

  async function getVideos(videoIds) {
    const uniqueIds = [...new Set(videoIds)].filter(Boolean).slice(0, 50)
    if (uniqueIds.length === 0) return []
    const result = await youtubeFetch('videos', {
      part: 'snippet,contentDetails,status',
      id: uniqueIds.join(','),
    })
    return (result.items ?? [])
      .filter(
        (item) =>
          item.status?.embeddable === true &&
          item.status?.privacyStatus === 'public' &&
          item.snippet?.liveBroadcastContent !== 'live',
      )
      .map(mapVideo)
  }

  async function getVideo(input) {
    const videoId = extractYouTubeVideoId(input)
    if (!videoId) {
      throw new AppError(400, '올바른 YouTube 영상 URL 또는 ID가 아닙니다.', 'INVALID_VIDEO')
    }
    const [video] = await getVideos([videoId])
    if (!video) {
      throw new AppError(
        404,
        '공개 상태이며 외부 재생이 가능한 영상을 찾지 못했습니다.',
        'VIDEO_NOT_PLAYABLE',
      )
    }
    return video
  }

  async function search(query) {
    const directVideoId = extractYouTubeVideoId(query)
    if (directVideoId) return [await getVideo(directVideoId)]

    const normalizedQuery = String(query ?? '').trim()
    if (normalizedQuery.length < 2 || normalizedQuery.length > 100) {
      throw new AppError(400, '검색어는 2자 이상 100자 이하여야 합니다.', 'INVALID_QUERY')
    }

    const result = await youtubeFetch('search', {
      part: 'snippet',
      type: 'video',
      videoEmbeddable: 'true',
      videoSyndicated: 'true',
      safeSearch: 'moderate',
      maxResults: 15,
      q: normalizedQuery,
    })
    const ids = (result.items ?? []).map((item) => item.id?.videoId).filter(Boolean)
    return getVideos(ids)
  }

  return { search, getVideo }
}

module.exports = {
  createYouTubeService,
  extractYouTubeVideoId,
  parseIsoDuration,
}
