export type YTPlayer = {
  cueVideoById(options: { videoId: string; startSeconds?: number }): void
  loadVideoById(options: { videoId: string; startSeconds?: number }): void
  playVideo(): void
  pauseVideo(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  getCurrentTime(): number
  getPlayerState(): number
  getVideoUrl(): string
  getVolume(): number
  isMuted(): boolean
  setVolume(volume: number): void
  mute(): void
  unMute(): void
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

export function loadYouTubeApi() {
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

export function getLoadedVideoId(player: YTPlayer) {
  const url = player.getVideoUrl()
  if (!url) return ''
  try {
    const parsed = new URL(url)
    return parsed.searchParams.get('v') ?? parsed.pathname.split('/').pop() ?? ''
  } catch {
    return ''
  }
}

export function shouldReloadMismatchedVideo(
  expectedVideoId: string,
  loadedVideoId: string,
  buffering: boolean,
  millisecondsSinceLoad: number,
) {
  if (!loadedVideoId || loadedVideoId === expectedVideoId) return false
  return millisecondsSinceLoad >= (buffering ? 8_000 : 2_000)
}
