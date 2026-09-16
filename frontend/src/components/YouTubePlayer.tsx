import { useEffect, useRef, useState } from 'react'
import { useI18n, type Translate } from '../i18n-context'
import { buttonStyles, cn } from '../styles'

type YTPlayer = {
  loadVideoById(videoId: string, startSeconds?: number): void
  playVideo(): void
  pauseVideo(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  getCurrentTime(): number
  getPlayerState(): number
  setVolume(volume: number): void
  destroy(): void
}

type YTPlayerEvent = { target: YTPlayer; data: number }

type YTNamespace = {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string
      playerVars: Record<string, string | number>
      events: {
        onReady(event: YTPlayerEvent): void
        onStateChange(event: YTPlayerEvent): void
        onError(event: YTPlayerEvent): void
        onAutoplayBlocked(): void
      }
    },
  ) => YTPlayer
}

declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

let youtubeApiPromise: Promise<YTNamespace> | null = null
const DRIFT_TOLERANCE_SECONDS = 0.75
const SYNCHRONIZATION_INTERVAL_MS = 3_000
const YOUTUBE_STATE_ENDED = 0
const YOUTUBE_STATE_PLAYING = 1
const YOUTUBE_STATE_BUFFERING = 3

export type PlaybackSynchronization = {
  positionSeconds: number
  anchorAt: number
  revision: number
  serverTimeOffsetMs: number
}

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (youtubeApiPromise) return youtubeApiPromise

  youtubeApiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const previousCallback = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.()
      if (window.YT) resolve(window.YT)
    }
    if (!document.querySelector('script[data-youtube-iframe-api]')) {
      const script = document.createElement('script')
      script.src = 'https://www.youtube.com/iframe_api'
      script.async = true
      script.dataset.youtubeIframeApi = 'true'
      script.onerror = () => reject(new Error('YouTube 플레이어를 불러오지 못했습니다.'))
      document.head.appendChild(script)
    }
  })
  return youtubeApiPromise
}

export function YouTubePlayer({
  videoId,
  volume,
  paused,
  playbackBlocked = false,
  onPlaybackBlockedChange,
  onEnded,
  synchronization,
}: {
  videoId: string
  volume: number
  paused: boolean
  playbackBlocked?: boolean
  onPlaybackBlockedChange?: (blocked: boolean) => void
  onEnded?: () => void
  synchronization?: PlaybackSynchronization
}) {
  const { t } = useI18n()
  const mountRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YTPlayer | null>(null)
  const videoIdRef = useRef(videoId)
  const volumeRef = useRef(volume)
  const pausedRef = useRef(paused)
  const synchronizationRef = useRef(synchronization)
  const playbackBlockedRef = useRef(playbackBlocked)
  const autoplayBlockedRef = useRef(false)
  const onPlaybackBlockedChangeRef = useRef(onPlaybackBlockedChange)
  const onEndedRef = useRef(onEnded)
  const finishedVideoRef = useRef('')
  const [autoplayBlocked, setAutoplayBlocked] = useState(false)
  const [playbackError, setPlaybackError] = useState<number | null>(null)
  const synchronizationRevision = synchronization?.revision
  synchronizationRef.current = synchronization

  function expectedPosition() {
    const sync = synchronizationRef.current
    if (!sync) return 0
    const serverNow = Date.now() + sync.serverTimeOffsetMs
    const elapsed = pausedRef.current
      ? 0
      : Math.max(0, serverNow - sync.anchorAt) / 1000
    return Math.max(0, sync.positionSeconds + elapsed)
  }

  function alignPlayer(player: YTPlayer, forceSeek: boolean) {
    const playerState = player.getPlayerState()
    if (
      playerState === YOUTUBE_STATE_ENDED &&
      finishedVideoRef.current === videoIdRef.current
    ) {
      return
    }

    const sync = synchronizationRef.current
    if (sync) {
      const expected = expectedPosition()
      const current = player.getCurrentTime()
      if (
        Number.isFinite(current) &&
        (forceSeek || Math.abs(current - expected) > DRIFT_TOLERANCE_SECONDS)
      ) {
        player.seekTo(expected, true)
      }
    }

    if (pausedRef.current) {
      player.pauseVideo()
    } else if (
      !autoplayBlockedRef.current &&
      playerState !== YOUTUBE_STATE_PLAYING
    ) {
      player.playVideo()
    }
  }

  useEffect(() => {
    videoIdRef.current = videoId
    finishedVideoRef.current = ''
    autoplayBlockedRef.current = false
    setAutoplayBlocked(false)
    setPlaybackError(null)
    const player = playerRef.current
    if (player) {
      player.loadVideoById(
        videoId,
        synchronizationRef.current ? expectedPosition() : undefined,
      )
      alignPlayer(player, Boolean(synchronizationRef.current))
    }
  }, [videoId])

  useEffect(() => {
    onEndedRef.current = onEnded
  }, [onEnded])

  useEffect(() => {
    playbackBlockedRef.current = playbackBlocked
    onPlaybackBlockedChangeRef.current = onPlaybackBlockedChange
  }, [onPlaybackBlockedChange, playbackBlocked])

  useEffect(() => {
    volumeRef.current = volume
    playerRef.current?.setVolume(volume)
  }, [volume])

  useEffect(() => {
    pausedRef.current = paused
    if (paused) {
      playerRef.current?.pauseVideo()
    } else {
      autoplayBlockedRef.current = false
      setAutoplayBlocked(false)
      playerRef.current?.playVideo()
    }
  }, [paused])

  useEffect(() => {
    if (!synchronizationRef.current) return
    const player = playerRef.current
    if (player) alignPlayer(player, true)
  }, [synchronizationRevision])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const player = playerRef.current
      if (!player || !synchronizationRef.current) return
      const playerState = player.getPlayerState()
      if (
        playerState === YOUTUBE_STATE_ENDED ||
        playerState === YOUTUBE_STATE_BUFFERING
      ) {
        return
      }
      alignPlayer(player, false)
    }, SYNCHRONIZATION_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let cancelled = false
    const container = mountRef.current
    if (!container) return

    // YouTube는 전달받은 엘리먼트 자체를 iframe으로 교체한다. React가
    // 소유한 노드를 직접 넘기면 언마운트 시 removeChild 오류가 발생하므로,
    // 컨테이너 안에 YouTube 전용 노드를 따로 만든다.
    const playerElement = document.createElement('div')
    container.replaceChildren(playerElement)
    let player: YTPlayer | null = null

    void loadYouTubeApi().then((YT) => {
      if (cancelled || !playerElement.isConnected) return
      player = new YT.Player(playerElement, {
        videoId: videoIdRef.current,
        playerVars: {
          autoplay: 1,
          controls: 1,
          playsinline: 1,
          rel: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: (event) => {
            event.target.setVolume(volumeRef.current)
            alignPlayer(event.target, Boolean(synchronizationRef.current))
          },
          onStateChange: (event) => {
            if (
              event.data === YOUTUBE_STATE_ENDED &&
              finishedVideoRef.current !== videoIdRef.current
            ) {
              finishedVideoRef.current = videoIdRef.current
              onEndedRef.current?.()
            }
            if (event.data === YOUTUBE_STATE_PLAYING) {
              const wasBlocked =
                autoplayBlockedRef.current || playbackBlockedRef.current
              autoplayBlockedRef.current = false
              setAutoplayBlocked(false)
              if (wasBlocked) {
                playbackBlockedRef.current = false
                onPlaybackBlockedChangeRef.current?.(false)
              }
            }
          },
          onError: (event) => setPlaybackError(event.data),
          onAutoplayBlocked: () => {
            if (
              autoplayBlockedRef.current &&
              playbackBlockedRef.current
            ) {
              return
            }
            autoplayBlockedRef.current = true
            playbackBlockedRef.current = true
            setAutoplayBlocked(true)
            onPlaybackBlockedChangeRef.current?.(true)
          },
        },
      })
      playerRef.current = player
    }).catch(() => {
      if (!cancelled) setPlaybackError(-1)
    })

    return () => {
      cancelled = true
      if (playerRef.current === player) playerRef.current = null
      try {
        player?.destroy()
      } finally {
        container.replaceChildren()
      }
    }
  }, [])

  return (
    <>
      <div className="size-full [&_iframe]:size-full" ref={mountRef} />
      {playbackError !== null ? (
        <div
          className={cn(
            'absolute inset-x-3 bottom-3 z-[2] flex items-center justify-center gap-3 rounded-[10px]',
            'border border-danger/30 bg-[#17141f]/95 px-3.5 py-3 text-center text-[13px] text-[#ffd4db]',
            'shadow-[0_12px_36px_rgba(0,0,0,.35)] md:inset-x-4 md:bottom-4',
          )}
          role="alert"
        >
          <span>{getPlaybackErrorMessage(playbackError, t)}</span>
          <button
            className={buttonStyles({ intent: 'player', size: 'sm' })}
            type="button"
            onClick={() => {
              setPlaybackError(null)
              const player = playerRef.current
              if (player) {
                player.loadVideoById(
                  videoIdRef.current,
                  synchronizationRef.current ? expectedPosition() : undefined,
                )
                alignPlayer(player, Boolean(synchronizationRef.current))
              }
            }}
          >
            {t('common.retry')}
          </button>
        </div>
      ) : autoplayBlocked && (
        <div className="absolute inset-x-3 bottom-3 z-[2] flex items-center justify-center gap-3 rounded-[10px] border border-line bg-[#17141f]/95 px-3.5 py-3 text-center text-[13px] text-muted shadow-[0_12px_36px_rgba(0,0,0,.35)] md:inset-x-4 md:bottom-4">
          {t('player.autoplayBlocked')}
          <button
            className={buttonStyles({ intent: 'player', size: 'sm' })}
            type="button"
            onClick={() => {
              autoplayBlockedRef.current = false
              setAutoplayBlocked(false)
              const player = playerRef.current
              if (player) alignPlayer(player, true)
            }}
          >
            {t('player.resume')}
          </button>
        </div>
      )}
    </>
  )
}

function getPlaybackErrorMessage(code: number, t: Translate) {
  switch (code) {
    case -1:
      return t('player.loadFailed')
    case 2:
      return t('player.invalidVideo', { code })
    case 5:
      return t('player.html5Error', { code })
    case 100:
      return t('player.unavailable', { code })
    case 101:
    case 150:
      return t('player.embedDisabled', { code })
    case 153:
      return t('player.requestUnverified', { code })
    default:
      return t('player.unknownError', { code })
  }
}
