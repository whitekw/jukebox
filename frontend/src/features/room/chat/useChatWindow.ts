import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  clamp,
  clampWindowRect,
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  WINDOW_MARGIN,
  type ChatWindowRect,
} from './chatWindowGeometry'

type InteractionMode = 'move' | 'nw' | 'ne' | 'sw' | 'se'

type WindowInteraction = {
  mode: InteractionMode
  startX: number
  startY: number
  startRect: ChatWindowRect
}

const CHAT_WINDOW_STORAGE_KEY = 'jukebox:chat-window'

function getTitlebarInset() {
  if (!document.documentElement.hasAttribute('data-bside-desktop')) return 0
  const header = document.querySelector('[data-desktop-titlebar]')
  const fallback = document.getElementById('bside-titlebar-fallback')
  return Math.max(
    0,
    header?.getBoundingClientRect().bottom ?? 0,
    fallback && !fallback.hidden ? fallback.getBoundingClientRect().bottom : 0,
  )
}

const clampToViewport = (rect: ChatWindowRect) =>
  clampWindowRect(rect, window.innerWidth, window.innerHeight, getTitlebarInset())

function getInitialWindowRect() {
  const fallback = clampToViewport({
    x: window.innerWidth - DEFAULT_WINDOW_WIDTH - 24,
    y: window.innerHeight - DEFAULT_WINDOW_HEIGHT - 96,
    width: DEFAULT_WINDOW_WIDTH,
    height: DEFAULT_WINDOW_HEIGHT,
  })

  try {
    const stored = JSON.parse(
      localStorage.getItem(CHAT_WINDOW_STORAGE_KEY) ?? 'null',
    ) as Partial<ChatWindowRect> | null
    if (
      stored &&
      Number.isFinite(stored.x) &&
      Number.isFinite(stored.y) &&
      Number.isFinite(stored.width) &&
      Number.isFinite(stored.height)
    ) {
      return clampToViewport(stored as ChatWindowRect)
    }
  } catch {
    // 손상된 저장값은 기본 위치로 대체합니다.
  }

  return fallback
}

export function useChatWindow() {
  const [isDesktop, setIsDesktop] = useState(() =>
    window.matchMedia('(min-width: 768px)').matches,
  )
  const [windowRect, setWindowRect] = useState(getInitialWindowRect)
  const windowRectRef = useRef(windowRect)
  const interactionRef = useRef<WindowInteraction | null>(null)
  const previousUserSelectRef = useRef('')
  const [mobileViewport, setMobileViewport] = useState(() => ({
    height: window.visualViewport?.height ?? window.innerHeight,
    width: window.visualViewport?.width ?? window.innerWidth,
    top: window.visualViewport?.offsetTop ?? 0,
    left: window.visualViewport?.offsetLeft ?? 0,
  }))
  const sheetHeight = Math.min(640, mobileViewport.height * 0.85)
  const chatWindowStyle: CSSProperties | undefined = isDesktop
    ? {
        left: windowRect.x,
        top: windowRect.y,
        width: windowRect.width,
        height: windowRect.height,
      }
    : {
        left: mobileViewport.left,
        top: mobileViewport.top + mobileViewport.height - sheetHeight,
        width: mobileViewport.width,
        height: sheetHeight,
      }

  function updateWindowRect(nextRect: ChatWindowRect) {
    windowRectRef.current = nextRect
    setWindowRect(nextRect)
  }

  useEffect(() => {
    const desktopMedia = window.matchMedia('(min-width: 768px)')
    const visualViewport = window.visualViewport
    const synchronizeViewport = () => {
      const desktop = desktopMedia.matches
      setIsDesktop(desktop)
      if (desktop) updateWindowRect(clampToViewport(windowRectRef.current))
      else setMobileViewport({
        height: visualViewport?.height ?? window.innerHeight,
        width: visualViewport?.width ?? window.innerWidth,
        top: visualViewport?.offsetTop ?? 0,
        left: visualViewport?.offsetLeft ?? 0,
      })
    }

    const headerObserver = new ResizeObserver(synchronizeViewport)
    const observeHeaders = () => {
      headerObserver.disconnect()
      document
        .querySelectorAll('[data-desktop-titlebar], #bside-titlebar-fallback')
        .forEach(header => headerObserver.observe(header))
      synchronizeViewport()
    }
    const desktopObserver = new MutationObserver(observeHeaders)
    desktopObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-bside-desktop', 'data-bside-titlebar-fallback'],
    })
    observeHeaders()
    desktopMedia.addEventListener('change', synchronizeViewport)
    window.addEventListener('resize', synchronizeViewport)
    visualViewport?.addEventListener('resize', synchronizeViewport)
    visualViewport?.addEventListener('scroll', synchronizeViewport)
    return () => {
      desktopMedia.removeEventListener('change', synchronizeViewport)
      window.removeEventListener('resize', synchronizeViewport)
      visualViewport?.removeEventListener('resize', synchronizeViewport)
      visualViewport?.removeEventListener('scroll', synchronizeViewport)
      headerObserver.disconnect()
      desktopObserver.disconnect()
    }
  }, [])

  useEffect(() => {
    if (!isDesktop) return

    const moveWindow = (event: PointerEvent) => {
      const interaction = interactionRef.current
      if (!interaction) return
      event.preventDefault()

      const deltaX = event.clientX - interaction.startX
      const deltaY = event.clientY - interaction.startY
      const start = interaction.startRect
      let left = start.x
      let right = start.x + start.width
      let top = start.y
      let bottom = start.y + start.height

      if (interaction.mode === 'move') {
        updateWindowRect(
          clampToViewport({
            ...start,
            x: start.x + deltaX,
            y: start.y + deltaY,
          }),
        )
        return
      }

      if (interaction.mode.includes('w')) {
        left = clamp(
          start.x + deltaX,
          WINDOW_MARGIN,
          right - Math.min(MIN_WINDOW_WIDTH, right - WINDOW_MARGIN),
        )
      }
      if (interaction.mode.includes('e')) {
        right = clamp(
          right + deltaX,
          left +
            Math.min(
              MIN_WINDOW_WIDTH,
              window.innerWidth - left - WINDOW_MARGIN,
            ),
          window.innerWidth - WINDOW_MARGIN,
        )
      }
      if (interaction.mode.includes('n')) {
        const minimumTop = clampToViewport({ ...start, y: -Infinity }).y
        top = clamp(
          start.y + deltaY,
          minimumTop,
          bottom - Math.min(MIN_WINDOW_HEIGHT, bottom - minimumTop),
        )
      }
      if (interaction.mode.includes('s')) {
        bottom = clamp(
          bottom + deltaY,
          top + Math.min(MIN_WINDOW_HEIGHT, window.innerHeight - top - WINDOW_MARGIN),
          window.innerHeight - WINDOW_MARGIN,
        )
      }

      updateWindowRect(
        clampToViewport({
          x: left,
          y: top,
          width: right - left,
          height: bottom - top,
        }),
      )
    }

    const finishInteraction = () => {
      if (!interactionRef.current) return
      interactionRef.current = null
      document.body.style.userSelect = previousUserSelectRef.current
      try {
        localStorage.setItem(CHAT_WINDOW_STORAGE_KEY, JSON.stringify(windowRectRef.current))
      } catch {
        // The current position still works when storage is unavailable.
      }
    }

    window.addEventListener('pointermove', moveWindow)
    window.addEventListener('pointerup', finishInteraction)
    window.addEventListener('pointercancel', finishInteraction)
    return () => {
      window.removeEventListener('pointermove', moveWindow)
      window.removeEventListener('pointerup', finishInteraction)
      window.removeEventListener('pointercancel', finishInteraction)
      interactionRef.current = null
      document.body.style.userSelect = previousUserSelectRef.current
    }
  }, [isDesktop])

  function startWindowInteraction(
    mode: InteractionMode,
    event: ReactPointerEvent<HTMLElement>,
  ) {
    if (!isDesktop || event.button !== 0) return
    if (
      mode === 'move' &&
      (event.target as HTMLElement).closest('button, input')
    ) {
      return
    }
    event.preventDefault()
    interactionRef.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      startRect: windowRectRef.current,
    }
    previousUserSelectRef.current = document.body.style.userSelect
    document.body.style.userSelect = 'none'
  }

  return { isDesktop, chatWindowStyle, startWindowInteraction }
}
