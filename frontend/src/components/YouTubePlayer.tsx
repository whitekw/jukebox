import { useEffect, useRef, useState } from 'react'
import { buttonStyles, cn } from '../styles'

type YTPlayer = {
  loadVideoById(videoId: string): void
  playVideo(): void
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
  onEnded,
}: {
  videoId: string
  volume: number
  onEnded: () => void
}) {
  const mountRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YTPlayer | null>(null)
  const videoIdRef = useRef(videoId)
  const volumeRef = useRef(volume)
  const onEndedRef = useRef(onEnded)
  const finishedVideoRef = useRef('')
  const [autoplayBlocked, setAutoplayBlocked] = useState(false)
  const [playbackError, setPlaybackError] = useState<number | null>(null)

  useEffect(() => {
    videoIdRef.current = videoId
    onEndedRef.current = onEnded
    finishedVideoRef.current = ''
    setAutoplayBlocked(false)
    setPlaybackError(null)
    playerRef.current?.loadVideoById(videoId)
  }, [videoId, onEnded])

  useEffect(() => {
    volumeRef.current = volume
    playerRef.current?.setVolume(volume)
  }, [volume])

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
            event.target.playVideo()
          },
          onStateChange: (event) => {
            if (event.data === 0 && finishedVideoRef.current !== videoIdRef.current) {
              finishedVideoRef.current = videoIdRef.current
              onEndedRef.current()
            }
          },
          onError: (event) => setPlaybackError(event.data),
          onAutoplayBlocked: () => setAutoplayBlocked(true),
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
          <span>{getPlaybackErrorMessage(playbackError)}</span>
          <button
            className={buttonStyles({ intent: 'player', size: 'sm' })}
            type="button"
            onClick={() => {
              setPlaybackError(null)
              playerRef.current?.loadVideoById(videoIdRef.current)
              playerRef.current?.playVideo()
            }}
          >
            다시 시도
          </button>
        </div>
      ) : autoplayBlocked && (
        <div className="absolute inset-x-3 bottom-3 z-[2] flex items-center justify-center gap-3 rounded-[10px] border border-line bg-[#17141f]/95 px-3.5 py-3 text-center text-[13px] text-muted shadow-[0_12px_36px_rgba(0,0,0,.35)] md:inset-x-4 md:bottom-4">
          브라우저가 자동재생을 막았습니다.
          <button
            className={buttonStyles({ intent: 'player', size: 'sm' })}
            type="button"
            onClick={() => playerRef.current?.playVideo()}
          >
            재생 계속
          </button>
        </div>
      )}
    </>
  )
}

function getPlaybackErrorMessage(code: number) {
  switch (code) {
    case -1:
      return 'YouTube 플레이어를 불러오지 못했습니다.'
    case 2:
      return 'YouTube 영상 주소가 올바르지 않습니다. (오류 2)'
    case 5:
      return '브라우저에서 이 영상을 재생하지 못했습니다. (오류 5)'
    case 100:
      return '삭제되었거나 비공개인 영상입니다. (오류 100)'
    case 101:
    case 150:
      return `영상 소유자가 외부 재생을 허용하지 않았습니다. (오류 ${code})`
    case 153:
      return 'YouTube가 재생 요청을 확인하지 못했습니다. 광고 차단 또는 추적 방지 설정을 확인해주세요. (오류 153)'
    default:
      return `YouTube 영상을 재생하지 못했습니다. (오류 ${code})`
  }
}
