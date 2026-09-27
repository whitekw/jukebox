import { useEffect, useRef, useState } from 'react'
import { useI18n, type Translate } from '../../../shared/i18n/i18n-context'
import { buttonStyles, cn } from '../../../shared/styles'
import {
  expectedPlaybackPosition,
  type PlaybackSynchronization,
} from './playbackSync'
import {
  getLoadedVideoId,
  loadYouTubeApi,
  shouldReloadMismatchedVideo,
  type YTPlayer,
} from './youtubeIframe'
import {
  clampVolume,
  readPlayerAudioSettings,
  writePlayerAudioSettings,
  type PlayerAudioSettings,
} from './playerAudioSettings'

const DRIFT_TOLERANCE_SECONDS = 0.75
const SYNCHRONIZATION_INTERVAL_MS = 3_000
const AUDIO_SETTINGS_POLL_INTERVAL_MS = 500
const YOUTUBE_STATE_ENDED = 0
const YOUTUBE_STATE_PLAYING = 1
const YOUTUBE_STATE_PAUSED = 2
const YOUTUBE_STATE_BUFFERING = 3

type PlaybackSession = {
  videoId: string
  loadedAt: number
  started: boolean
  startReported: boolean
  ended: boolean
}

export function YouTubePlayer({
  videoId,
  volume,
  paused,
  playbackBlocked = false,
  onPlaybackBlockedChange,
  onPlaybackStarted,
  onEnded,
  synchronization,
}: {
  videoId: string
  volume: number
  paused: boolean
  playbackBlocked?: boolean
  onPlaybackBlockedChange?: (blocked: boolean) => void
  onPlaybackStarted?: (videoId: string, positionSeconds: number) => void
  onEnded?: () => void
  synchronization?: PlaybackSynchronization
}) {
  const { t } = useI18n()
  const mountRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YTPlayer | null>(null)
  const playerReadyRef = useRef(false)
  const videoIdRef = useRef(videoId)
  const initialAudioSettingsRef = useRef<PlayerAudioSettings | null>(null)
  if (initialAudioSettingsRef.current === null) {
    initialAudioSettingsRef.current = readPlayerAudioSettings(volume)
  }
  const volumeRef = useRef(initialAudioSettingsRef.current.volume)
  const mutedRef = useRef(initialAudioSettingsRef.current.muted)
  const volumePropRef = useRef(volume)
  const pausedRef = useRef(paused)
  const synchronizationRef = useRef(synchronization)
  const playbackBlockedRef = useRef(playbackBlocked)
  const autoplayBlockedRef = useRef(false)
  const locallyPausedRef = useRef(false)
  const onPlaybackBlockedChangeRef = useRef(onPlaybackBlockedChange)
  const onPlaybackStartedRef = useRef(onPlaybackStarted)
  const onEndedRef = useRef(onEnded)
  const requestedPausedStateRef = useRef<boolean | null>(null)
  const playbackSessionRef = useRef<PlaybackSession>({
    videoId,
    loadedAt: performance.now(),
    started: false,
    startReported: false,
    ended: false,
  })
  const transitionRetryTimerRef = useRef<number | null>(null)
  const [autoplayBlocked, setAutoplayBlocked] = useState(false)
  const [playbackError, setPlaybackError] = useState<number | null>(null)
  const synchronizationRevision = synchronization?.revision
  synchronizationRef.current = synchronization

  function applyPlayerAudioSettings(player: YTPlayer) {
    player.setVolume(volumeRef.current)
    if (mutedRef.current) {
      player.mute()
    } else {
      player.unMute()
    }
  }

  function capturePlayerAudioSettings(player: YTPlayer) {
    try {
      const currentVolume = player.getVolume()
      if (!Number.isFinite(currentVolume)) return

      const nextVolume = clampVolume(currentVolume)
      const nextMuted = player.isMuted()
      if (
        nextVolume === volumeRef.current &&
        nextMuted === mutedRef.current
      ) {
        return
      }

      volumeRef.current = nextVolume
      mutedRef.current = nextMuted
      writePlayerAudioSettings({ volume: nextVolume, muted: nextMuted })
    } catch {
      // 아직 준비되지 않았거나 제거 중인 iframe의 값은 읽을 수 없다.
    }
  }

  function expectedPosition() {
    return expectedPlaybackPosition(
      synchronizationRef.current,
      pausedRef.current,
      Date.now(),
    )
  }

  function loadSessionVideo(player: YTPlayer, session: PlaybackSession) {
    session.loadedAt = performance.now()
    session.started = false
    session.startReported = false
    session.ended = false
    setPlaybackError(null)
    const loadOptions = {
      videoId: session.videoId,
      ...(synchronizationRef.current
        ? { startSeconds: expectedPosition() }
        : {}),
    }
    if (pausedRef.current || locallyPausedRef.current) {
      player.cueVideoById(loadOptions)
      requestedPausedStateRef.current = pausedRef.current ? true : null
    } else {
      requestedPausedStateRef.current = false
      player.loadVideoById(loadOptions)
    }
  }

  function alignPlayer(player: YTPlayer, forceSeek: boolean) {
    if (
      !playerReadyRef.current ||
      typeof player.getPlayerState !== 'function'
    ) {
      return
    }
    const loadedVideoId = getLoadedVideoId(player)
    if (loadedVideoId && loadedVideoId !== videoIdRef.current) return
    const playerState = player.getPlayerState()
    if (playerState === YOUTUBE_STATE_ENDED) return

    const sync = synchronizationRef.current
    if (sync && !sync.pending && (!locallyPausedRef.current || forceSeek)) {
      const expected = expectedPosition()
      const current = player.getCurrentTime()
      if (
        Number.isFinite(current) &&
        (forceSeek || Math.abs(current - expected) > DRIFT_TOLERANCE_SECONDS)
      ) {
        player.seekTo(expected, true)
      }
    }

    if (pausedRef.current || locallyPausedRef.current) {
      if (playerState !== YOUTUBE_STATE_PAUSED) {
        requestedPausedStateRef.current = true
        player.pauseVideo()
      }
    } else if (
      !autoplayBlockedRef.current &&
      playerState !== YOUTUBE_STATE_PLAYING
    ) {
      requestedPausedStateRef.current = false
      player.playVideo()
    }
  }

  useEffect(() => {
    videoIdRef.current = videoId
    const session: PlaybackSession = {
      videoId,
      loadedAt: performance.now(),
      started: false,
      startReported: false,
      ended: false,
    }
    playbackSessionRef.current = session
    requestedPausedStateRef.current =
      pausedRef.current || locallyPausedRef.current
    autoplayBlockedRef.current = false
    setAutoplayBlocked(false)
    setPlaybackError(null)
    if (transitionRetryTimerRef.current !== null) {
      window.clearTimeout(transitionRetryTimerRef.current)
      transitionRetryTimerRef.current = null
    }
    const player = playerRef.current
    if (
      player &&
      playerReadyRef.current &&
      typeof player.loadVideoById === 'function'
    ) {
      loadSessionVideo(player, session)

      // loadVideoById 자체가 영상을 재생한다. 전환 직후에는 이전 영상의
      // 상태가 잠시 남을 수 있으므로 즉시 seek/play 명령을 겹쳐 보내지 않는다.
      // 드물게 새 영상이 준비되지 않은 상태에 머물면 한 번만 재생을 재시도한다.
      transitionRetryTimerRef.current = window.setTimeout(() => {
        transitionRetryTimerRef.current = null
        if (
          playbackSessionRef.current !== session ||
          session.started ||
          pausedRef.current ||
          locallyPausedRef.current ||
          autoplayBlockedRef.current
        ) {
          return
        }
        const state = player.getPlayerState()
        if (
          state !== YOUTUBE_STATE_PLAYING &&
          state !== YOUTUBE_STATE_BUFFERING
        ) {
          requestedPausedStateRef.current = false
          player.playVideo()
        }
      }, 1_200)
    }

    return () => {
      if (transitionRetryTimerRef.current !== null) {
        window.clearTimeout(transitionRetryTimerRef.current)
        transitionRetryTimerRef.current = null
      }
    }
  }, [videoId])

  useEffect(() => {
    onEndedRef.current = onEnded
  }, [onEnded])

  useEffect(() => {
    onPlaybackStartedRef.current = onPlaybackStarted
  }, [onPlaybackStarted])

  useEffect(() => {
    playbackBlockedRef.current = playbackBlocked
    onPlaybackBlockedChangeRef.current = onPlaybackBlockedChange
  }, [onPlaybackBlockedChange, playbackBlocked])

  useEffect(() => {
    if (volumePropRef.current === volume) return

    volumePropRef.current = volume
    volumeRef.current = clampVolume(volume)
    writePlayerAudioSettings({
      volume: volumeRef.current,
      muted: mutedRef.current,
    })
    playerRef.current?.setVolume(volumeRef.current)
  }, [volume])

  useEffect(() => {
    pausedRef.current = paused
    requestedPausedStateRef.current = paused
    const player = playerRef.current
    if (!player || !playerReadyRef.current) return
    if (paused) {
      player.pauseVideo()
    } else {
      locallyPausedRef.current = false
      autoplayBlockedRef.current = false
      setAutoplayBlocked(false)
      alignPlayer(player, true)
    }
  }, [paused])

  useEffect(() => {
    if (!synchronizationRef.current) return
    const player = playerRef.current
    const session = playbackSessionRef.current
    if (player && session.videoId === videoIdRef.current && session.started) {
      // 새 곡이 실제로 재생되었다는 확인 응답도 revision을 변경한다.
      // 이때 현재 위치가 이미 서버 타임라인과 맞는데 강제로 seek하면 곡의
      // 첫 부분이 잠깐 재생된 뒤 다시 들리는 현상이 생기므로, 실제 drift가
      // 허용 범위를 넘었을 때만 위치를 보정한다.
      alignPlayer(player, false)
    }
  }, [synchronizationRevision])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const player = playerRef.current
      if (
        !player ||
        !playerReadyRef.current
      ) {
        return
      }
      const playerState = player.getPlayerState()
      const session = playbackSessionRef.current
      const loadedVideoId = getLoadedVideoId(player)
      if (loadedVideoId && loadedVideoId !== session.videoId) {
        // 위치만 보정하면 이전 영상이 계속 재생될 수 있다.
        if (shouldReloadMismatchedVideo(
          session.videoId,
          loadedVideoId,
          playerState === YOUTUBE_STATE_BUFFERING,
          performance.now() - session.loadedAt,
        )) {
          loadSessionVideo(player, session)
        }
        return
      }
      if (!synchronizationRef.current) return
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
    const timer = window.setInterval(() => {
      const player = playerRef.current
      if (player && playerReadyRef.current) {
        capturePlayerAudioSettings(player)
      }
    }, AUDIO_SETTINGS_POLL_INTERVAL_MS)
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
      const initialVideoId = videoIdRef.current
      player = new YT.Player(playerElement, {
        videoId: initialVideoId,
        playerVars: {
          autoplay: pausedRef.current ? 0 : 1,
          controls: 1,
          playsinline: 1,
          rel: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: (event) => {
            playerReadyRef.current = true
            applyPlayerAudioSettings(event.target)
            const loadedVideoId = getLoadedVideoId(event.target)
            if (
              initialVideoId !== videoIdRef.current ||
              (loadedVideoId && loadedVideoId !== videoIdRef.current)
            ) {
              loadSessionVideo(event.target, playbackSessionRef.current)
              return
            }
            if (synchronizationRef.current?.pending && expectedPosition() > 0) {
              event.target.seekTo(expectedPosition(), true)
            }
            alignPlayer(event.target, Boolean(synchronizationRef.current))
          },
          onStateChange: (event) => {
            const session = playbackSessionRef.current
            const loadedVideoId = getLoadedVideoId(event.target)
            if (loadedVideoId && loadedVideoId !== session.videoId) return
            if (
              event.data === YOUTUBE_STATE_ENDED &&
              session.videoId === videoIdRef.current &&
              performance.now() - session.loadedAt >= 500 &&
              !session.ended
            ) {
              // 새 영상을 로드하는 도중 이전 영상의 ENDED 이벤트가 늦게
              // 도착할 수 있다. 로드 직후 보호 구간이 지난 현재 영상의
              // 종료 이벤트만 방의 다음 곡 처리로 전달한다.
              capturePlayerAudioSettings(event.target)
              session.ended = true
              onEndedRef.current?.()
            }
            if (event.data === YOUTUBE_STATE_PLAYING) {
              if (session.videoId === videoIdRef.current) {
                session.started = true
                if (
                  synchronizationRef.current?.pending &&
                  !session.startReported
                ) {
                  session.startReported = true
                  onPlaybackStartedRef.current?.(
                    session.videoId,
                    Math.max(0, event.target.getCurrentTime()),
                  )
                }
              }
              if (transitionRetryTimerRef.current !== null) {
                window.clearTimeout(transitionRetryTimerRef.current)
                transitionRetryTimerRef.current = null
              }
              const wasBlocked =
                autoplayBlockedRef.current || playbackBlockedRef.current
              autoplayBlockedRef.current = false
              setAutoplayBlocked(false)
              if (wasBlocked) {
                playbackBlockedRef.current = false
                onPlaybackBlockedChangeRef.current?.(false)
              }
              if (pausedRef.current) {
                requestedPausedStateRef.current = true
                event.target.pauseVideo()
                return
              }
              if (locallyPausedRef.current) {
                if (requestedPausedStateRef.current === true) {
                  event.target.pauseVideo()
                  return
                }
                locallyPausedRef.current = false
                requestedPausedStateRef.current = false
                alignPlayer(event.target, true)
              }
            }
            if (
              event.data === YOUTUBE_STATE_PLAYING ||
              event.data === YOUTUBE_STATE_PAUSED
            ) {
              const eventPaused = event.data === YOUTUBE_STATE_PAUSED
              // 다음 영상을 불러오는 중 전달되는 이전 영상의 PAUSED 이벤트가
              // 방 전체를 일시정지시키지 않도록 실제 재생 시작 전에는 무시한다.
              if (eventPaused && !session.started) return
              if (requestedPausedStateRef.current === eventPaused) {
                requestedPausedStateRef.current = null
              } else if (eventPaused && !pausedRef.current) {
                locallyPausedRef.current = true
              }
            }
          },
          onError: (event) => {
            if (transitionRetryTimerRef.current !== null) {
              window.clearTimeout(transitionRetryTimerRef.current)
              transitionRetryTimerRef.current = null
            }
            setPlaybackError(event.data)
          },
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
      if (transitionRetryTimerRef.current !== null) {
        window.clearTimeout(transitionRetryTimerRef.current)
        transitionRetryTimerRef.current = null
      }
      if (player && playerReadyRef.current) {
        capturePlayerAudioSettings(player)
      }
      playerReadyRef.current = false
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
              if (
                player &&
                playerReadyRef.current &&
                typeof player.loadVideoById === 'function'
              ) {
                const session: PlaybackSession = {
                  videoId: videoIdRef.current,
                  loadedAt: performance.now(),
                  started: false,
                  startReported: false,
                  ended: false,
                }
                playbackSessionRef.current = session
                player.loadVideoById({
                  videoId: videoIdRef.current,
                  ...(synchronizationRef.current &&
                  !synchronizationRef.current.pending
                    ? { startSeconds: expectedPosition() }
                    : {}),
                })
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
