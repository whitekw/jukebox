const test = require('node:test')
const assert = require('node:assert/strict')
const {
  createYouTubeService,
  extractYouTubeVideoId,
  normalizeRegionCode,
  parseIsoDuration,
} = require('../src/youtube')

test('extracts supported YouTube URLs and raw IDs', () => {
  const id = 'dQw4w9WgXcQ'
  assert.equal(extractYouTubeVideoId(id), id)
  assert.equal(extractYouTubeVideoId(`https://youtu.be/${id}?t=10`), id)
  assert.equal(extractYouTubeVideoId(`https://www.youtube.com/watch?v=${id}`), id)
  assert.equal(extractYouTubeVideoId(`https://music.youtube.com/watch?v=${id}`), id)
  assert.equal(extractYouTubeVideoId(`https://youtube.com/shorts/${id}`), id)
  assert.equal(extractYouTubeVideoId('https://example.com/watch?v=dQw4w9WgXcQ'), null)
})

test('parses ISO 8601 durations', () => {
  assert.equal(parseIsoDuration('PT3M42S'), 222)
  assert.equal(parseIsoDuration('PT1H2M3S'), 3723)
  assert.equal(parseIsoDuration('invalid'), 0)
})

test('normalizes chart regions and falls back to Korea', () => {
  assert.equal(normalizeRegionCode('jp'), 'JP')
  assert.equal(normalizeRegionCode('', 'us'), 'US')
  assert.equal(normalizeRegionCode('invalid', 'invalid'), 'KR')
})

test('searches only for videos playable outside YouTube and filters metadata', async () => {
  const requestedUrls = []
  const responses = [
    {
      items: [
        { id: { videoId: 'aaaaaaaaaaa' } },
        { id: { videoId: 'bbbbbbbbbbb' } },
        { id: { videoId: 'ccccccccccc' } },
      ],
    },
    {
      items: [
        {
          id: 'aaaaaaaaaaa',
          snippet: {
            title: 'Playable',
            channelTitle: 'Artist',
            liveBroadcastContent: 'none',
          },
          contentDetails: { duration: 'PT3M' },
          status: { embeddable: true, privacyStatus: 'public' },
        },
        {
          id: 'bbbbbbbbbbb',
          snippet: { liveBroadcastContent: 'none' },
          contentDetails: { duration: 'PT3M' },
          status: { embeddable: false, privacyStatus: 'public' },
        },
        {
          id: 'ccccccccccc',
          snippet: { liveBroadcastContent: 'none' },
          contentDetails: { duration: 'PT3M' },
          status: { privacyStatus: 'public' },
        },
      ],
    },
  ]
  const youtube = createYouTubeService('test-key', {
    fetchImpl: async (url) => {
      requestedUrls.push(new URL(url))
      return {
        ok: true,
        status: 200,
        json: async () => responses.shift(),
      }
    },
  })

  const videos = await youtube.search('test song')

  assert.equal(videos.length, 1)
  assert.equal(videos[0].videoId, 'aaaaaaaaaaa')
  assert.equal(requestedUrls[0].pathname, '/youtube/v3/search')
  assert.equal(requestedUrls[0].searchParams.get('type'), 'video')
  assert.equal(requestedUrls[0].searchParams.get('videoEmbeddable'), 'true')
  assert.equal(requestedUrls[0].searchParams.get('videoSyndicated'), 'true')
  assert.equal(requestedUrls[1].pathname, '/youtube/v3/videos')
  assert.match(requestedUrls[1].searchParams.get('part'), /status/)
})

test('rejects a directly added video when embedding is disabled', async () => {
  const youtube = createYouTubeService('test-key', {
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          {
            id: 'aaaaaaaaaaa',
            snippet: { liveBroadcastContent: 'none' },
            contentDetails: { duration: 'PT3M' },
            status: { embeddable: false, privacyStatus: 'public' },
          },
        ],
      }),
    }),
  })

  await assert.rejects(
    youtube.getVideo('aaaaaaaaaaa'),
    (error) => error.code === 'VIDEO_NOT_PLAYABLE' && error.status === 404,
  )
})

test('loads popular music including non-embeddable videos and caches it per region', async () => {
  const requestedUrls = []
  let currentTime = 1_000
  const youtube = createYouTubeService('test-key', {
    now: () => currentTime,
    popularMusicCacheTtlMs: 1_000,
    fetchImpl: async (url) => {
      requestedUrls.push(new URL(url))
      return {
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              id: 'aaaaaaaaaaa',
              snippet: {
                title: 'Popular song',
                channelTitle: 'Popular artist',
                liveBroadcastContent: 'none',
              },
              contentDetails: { duration: 'PT3M20S' },
              status: { embeddable: true, privacyStatus: 'public' },
            },
            {
              id: 'bbbbbbbbbbb',
              snippet: { liveBroadcastContent: 'none' },
              contentDetails: { duration: 'PT4M' },
              status: { embeddable: false, privacyStatus: 'public' },
            },
          ],
        }),
      }
    },
  })

  const [first, concurrent] = await Promise.all([
    youtube.getPopularMusic('kr'),
    youtube.getPopularMusic('KR'),
  ])

  assert.deepEqual(first, concurrent)
  assert.equal(first.regionCode, 'KR')
  assert.equal(first.items.length, 2)
  assert.equal(first.items[0].title, 'Popular song')
  assert.equal(first.items[0].embeddable, true)
  assert.equal(first.items[1].embeddable, false)
  assert.equal(requestedUrls.length, 1)
  assert.equal(requestedUrls[0].pathname, '/youtube/v3/videos')
  assert.equal(requestedUrls[0].searchParams.get('chart'), 'mostPopular')
  assert.equal(requestedUrls[0].searchParams.get('regionCode'), 'KR')
  assert.equal(requestedUrls[0].searchParams.get('videoCategoryId'), '10')
  assert.match(requestedUrls[0].searchParams.get('part'), /status/)

  await youtube.getPopularMusic('KR')
  assert.equal(requestedUrls.length, 1)

  await youtube.getPopularMusic('JP')
  assert.equal(requestedUrls.length, 2)

  currentTime += 1_001
  await youtube.getPopularMusic('KR')
  assert.equal(requestedUrls.length, 3)
})

test('falls back when a regional music chart is unavailable', async () => {
  const requestedUrls = []
  const responses = [
    {
      ok: false,
      status: 400,
      body: {
        error: {
          message: 'The requested chart is not available.',
          errors: [{ reason: 'videoChartNotFound' }],
        },
      },
    },
    {
      ok: true,
      status: 200,
      body: { items: [] },
    },
  ]
  const youtube = createYouTubeService('test-key', {
    fetchImpl: async (url) => {
      requestedUrls.push(new URL(url))
      const response = responses.shift()
      return {
        ok: response.ok,
        status: response.status,
        json: async () => response.body,
      }
    },
  })

  const result = await youtube.getPopularMusic('AQ', 'KR')

  assert.equal(result.regionCode, 'KR')
  assert.equal(requestedUrls.length, 2)
  assert.equal(requestedUrls[0].searchParams.get('regionCode'), 'AQ')
  assert.equal(requestedUrls[1].searchParams.get('regionCode'), 'KR')

  await youtube.getPopularMusic('AQ', 'KR')
  assert.equal(requestedUrls.length, 2)
})
