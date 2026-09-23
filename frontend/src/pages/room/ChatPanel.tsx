import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { CloseIcon, MessageCircleIcon } from '../../components/Icons'
import {
  getErrorMessage,
  useI18n,
  type Translate,
} from '../../i18n-context'
import {
  buttonStyles,
  cn,
  formControlStyles,
  panelStyles,
  sectionKickerStyles,
} from '../../styles'
import type { ChatMessage } from '../../types'

type SystemChatMessage = Extract<ChatMessage, { type: 'system' }>

type ChatPanelProps = {
  messages: ChatMessage[]
  currentParticipantId: string
  onSend: (content: string) => Promise<void>
}

type ChatWindowRect = {
  x: number
  y: number
  width: number
  height: number
}

type InteractionMode = 'move' | 'nw' | 'ne' | 'sw' | 'se'

type WindowInteraction = {
  mode: InteractionMode
  startX: number
  startY: number
  startRect: ChatWindowRect
}

const CHAT_WINDOW_STORAGE_KEY = 'jukebox:chat-window'
const WINDOW_MARGIN = 12
const DEFAULT_WINDOW_WIDTH = 400
const DEFAULT_WINDOW_HEIGHT = 560
const MIN_WINDOW_WIDTH = 320
const MIN_WINDOW_HEIGHT = 360

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum)
}

function clampWindowRect(
  rect: ChatWindowRect,
  viewportWidth = window.innerWidth,
  viewportHeight = window.innerHeight,
) {
  const maxWidth = Math.max(1, viewportWidth - WINDOW_MARGIN * 2)
  const maxHeight = Math.max(1, viewportHeight - WINDOW_MARGIN * 2)
  const minimumWidth = Math.min(MIN_WINDOW_WIDTH, maxWidth)
  const minimumHeight = Math.min(MIN_WINDOW_HEIGHT, maxHeight)
  const width = clamp(rect.width, minimumWidth, maxWidth)
  const height = clamp(rect.height, minimumHeight, maxHeight)

  return {
    x: clamp(rect.x, WINDOW_MARGIN, viewportWidth - WINDOW_MARGIN - width),
    y: clamp(rect.y, WINDOW_MARGIN, viewportHeight - WINDOW_MARGIN - height),
    width,
    height,
  }
}

function getInitialWindowRect() {
  const fallback = clampWindowRect({
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
      return clampWindowRect(stored as ChatWindowRect)
    }
  } catch {
    // 손상된 저장값은 기본 위치로 대체합니다.
  }

  return fallback
}

function formatSystemMessage(message: SystemChatMessage, t: Translate) {
  const actor =
    message.actorType === 'host'
      ? t('chat.actor.host')
      : message.actorType === 'participant' && message.nickname
        ? message.nickname
        : t('chat.actor.system')
  const title = String(message.data.title ?? '')
  const target = String(message.data.target ?? '')
  const position = Number(message.data.position ?? 0)

  switch (message.eventType) {
    case 'song_added':
      return t('chat.event.songAdded', { actor, title })
    case 'song_skipped':
      return t('chat.event.songSkipped', { actor, title })
    case 'song_removed':
      return t('chat.event.songRemoved', { actor, title })
    case 'queue_reordered':
      return t('chat.event.queueReordered', { actor, title, position })
    case 'playback_paused':
      return t('chat.event.playbackPaused', { actor })
    case 'playback_resumed':
      return t('chat.event.playbackResumed', { actor })
    case 'participant_joined':
      return t('chat.event.participantJoined', { actor })
    case 'participant_left':
      return t('chat.event.participantLeft', { actor })
    case 'manager_added':
      return message.data.automatic
        ? t('chat.event.managerAutoAdded', { target })
        : t('chat.event.managerAdded', { actor, target })
    case 'manager_removed':
      return t('chat.event.managerRemoved', { actor, target })
  }
}

export function ChatPanel({
  messages,
  currentParticipantId,
  onSend,
}: ChatPanelProps) {
  const { locale, t } = useI18n()
  const [open, setOpen] = useState(false)
  const [hasOpened, setHasOpened] = useState(false)
  const [lastReadSequence, setLastReadSequence] = useState(0)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<unknown>(null)
  const [isDesktop, setIsDesktop] = useState(() =>
    window.matchMedia('(min-width: 768px)').matches,
  )
  const [windowRect, setWindowRect] = useState(getInitialWindowRect)
  const messageListRef = useRef<HTMLDivElement>(null)
  const windowRectRef = useRef(windowRect)
  const interactionRef = useRef<WindowInteraction | null>(null)
  const previousUserSelectRef = useRef('')
  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
      }),
    [locale],
  )
  const latestSequence = messages.at(-1)?.sequence ?? 0
  const unreadCount = hasOpened
    ? messages.filter(
        (message) =>
          message.sequence > lastReadSequence &&
          message.participantId !== currentParticipantId,
      ).length
    : 0
  const chatWindowStyle: CSSProperties | undefined = isDesktop
    ? {
        left: windowRect.x,
        top: windowRect.y,
        width: windowRect.width,
        height: windowRect.height,
      }
    : undefined

  function updateWindowRect(nextRect: ChatWindowRect) {
    windowRectRef.current = nextRect
    setWindowRect(nextRect)
  }

  useEffect(() => {
    const desktopMedia = window.matchMedia('(min-width: 768px)')
    const synchronizeViewport = () => {
      const desktop = desktopMedia.matches
      setIsDesktop(desktop)
      if (desktop) updateWindowRect(clampWindowRect(windowRectRef.current))
    }

    desktopMedia.addEventListener('change', synchronizeViewport)
    window.addEventListener('resize', synchronizeViewport)
    return () => {
      desktopMedia.removeEventListener('change', synchronizeViewport)
      window.removeEventListener('resize', synchronizeViewport)
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
          clampWindowRect({
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
        top = clamp(
          start.y + deltaY,
          WINDOW_MARGIN,
          bottom - Math.min(MIN_WINDOW_HEIGHT, bottom - WINDOW_MARGIN),
        )
      }
      if (interaction.mode.includes('s')) {
        bottom = clamp(
          bottom + deltaY,
          top + Math.min(MIN_WINDOW_HEIGHT, window.innerHeight - top - WINDOW_MARGIN),
          window.innerHeight - WINDOW_MARGIN,
        )
      }

      updateWindowRect({
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
      })
    }

    const finishInteraction = () => {
      if (!interactionRef.current) return
      interactionRef.current = null
      document.body.style.userSelect = previousUserSelectRef.current
      localStorage.setItem(
        CHAT_WINDOW_STORAGE_KEY,
        JSON.stringify(windowRectRef.current),
      )
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

  useEffect(() => {
    if (!open) return
    setLastReadSequence(latestSequence)
    const messageList = messageListRef.current
    if (messageList) messageList.scrollTop = messageList.scrollHeight
  }, [latestSequence, open])

  function toggleChat() {
    setOpen((current) => {
      const next = !current
      if (next) setHasOpened(true)
      return next
    })
  }

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

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const content = draft.trim()
    if (!content || sending) return
    setSending(true)
    setSendError(null)
    try {
      await onSend(content)
      setDraft('')
    } catch (requestError) {
      setSendError(requestError)
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {open && (
        <section
          className={cn(
            panelStyles({ padding: 'none' }),
            'fixed right-3 bottom-[84px] z-40 flex h-[min(560px,calc(100dvh-104px))] w-[calc(100vw-24px)] max-w-[400px] flex-col overflow-hidden bg-[#110f16]/95 shadow-[0_24px_80px_rgba(0,0,0,.55)] backdrop-blur-xl md:right-auto md:bottom-auto md:h-auto md:w-auto md:max-w-none',
          )}
          style={chatWindowStyle}
          role="dialog"
          aria-label={t('chat.title')}
        >
          <header
            className={cn(
              'flex items-center justify-between gap-4 border-b border-line px-4 py-4 md:px-[18px]',
              isDesktop && 'cursor-move touch-none select-none',
            )}
            onPointerDown={(event) => startWindowInteraction('move', event)}
          >
            <div className="min-w-0">
              <span className={sectionKickerStyles}>ROOM CHAT</span>
            </div>
            <button
              className="grid size-9 shrink-0 place-items-center rounded-full border border-line bg-white/[0.035] text-muted transition-colors hover:bg-white/10 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple"
              type="button"
              aria-label={t('chat.close')}
              onClick={() => setOpen(false)}
            >
              <CloseIcon size={17} />
            </button>
          </header>

          <div className="flex min-h-0 flex-1 flex-col px-3 pt-3 pb-3 md:px-[18px] md:pt-4 md:pb-[18px]">
            <div
              ref={messageListRef}
              className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1 py-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
              aria-live="polite"
            >
              {messages.length === 0 ? (
                <div className="grid flex-1 place-items-center text-center text-xs text-dim">
                  {t('chat.empty')}
                </div>
              ) : (
                messages.map((message) => {
                  if (message.type === 'system') {
                    return (
                      <div
                        key={message.id}
                        className="flex w-full items-center gap-2 py-1 text-[11px] leading-4 text-dim"
                      >
                        <span className="h-px min-w-3 flex-1 bg-line/70" />
                        <p className="m-0 max-w-[78%] text-center [overflow-wrap:anywhere]">
                          {formatSystemMessage(message, t)}
                          <time
                            className="ml-1.5 whitespace-nowrap text-[9px] text-dim/70"
                            dateTime={new Date(message.createdAt).toISOString()}
                          >
                            {timeFormatter.format(message.createdAt)}
                          </time>
                        </p>
                        <span className="h-px min-w-3 flex-1 bg-line/70" />
                      </div>
                    )
                  }
                  const isMine = message.participantId === currentParticipantId
                  return (
                    <article
                      key={message.id}
                      className={cn(
                        'flex max-w-[88%] flex-col gap-1',
                        isMine ? 'self-end items-end' : 'self-start items-start',
                      )}
                    >
                      <div className="flex items-center gap-2 px-1 text-[10px] text-dim">
                        <strong className="max-w-36 truncate font-extrabold text-muted">
                          {isMine ? t('chat.you') : message.nickname}
                        </strong>
                        <time dateTime={new Date(message.createdAt).toISOString()}>
                          {timeFormatter.format(message.createdAt)}
                        </time>
                      </div>
                      <p
                        className={cn(
                          'm-0 whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed [overflow-wrap:anywhere]',
                          isMine
                            ? 'rounded-br-md bg-purple text-white'
                            : 'rounded-bl-md border border-line bg-white/[0.055] text-ink',
                        )}
                      >
                        {message.content}
                      </p>
                    </article>
                  )
                })
              )}
            </div>

            <form className="mt-3 flex items-center gap-2" onSubmit={send}>
              <input
                className={formControlStyles()}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={300}
                placeholder={t('chat.placeholder')}
                aria-label={t('chat.placeholder')}
              />
              <button
                className={cn(
                  buttonStyles({ intent: 'primary', size: 'md' }),
                  'shrink-0 px-4',
                )}
                type="submit"
                disabled={sending || draft.trim().length === 0}
              >
                {sending ? t('chat.sending') : t('chat.send')}
              </button>
            </form>
            {sendError !== null && (
              <p className="mt-2 px-1 text-xs text-[#ff9cab]" role="alert">
                {getErrorMessage(sendError, t)}
              </p>
            )}
          </div>

          {isDesktop && (
            <>
              <div
                className="absolute top-0 left-0 z-10 size-5 cursor-nwse-resize touch-none border-t-2 border-l-2 border-transparent hover:border-purple-light/60"
                aria-hidden="true"
                onPointerDown={(event) => startWindowInteraction('nw', event)}
              />
              <div
                className="absolute top-0 right-0 z-10 size-5 cursor-nesw-resize touch-none border-t-2 border-r-2 border-transparent hover:border-purple-light/60"
                aria-hidden="true"
                onPointerDown={(event) => startWindowInteraction('ne', event)}
              />
              <div
                className="absolute bottom-0 left-0 z-10 size-5 cursor-nesw-resize touch-none border-b-2 border-l-2 border-transparent hover:border-purple-light/60"
                aria-hidden="true"
                onPointerDown={(event) => startWindowInteraction('sw', event)}
              />
              <div
                className="absolute right-0 bottom-0 z-10 size-5 cursor-nwse-resize touch-none border-r-2 border-b-2 border-transparent hover:border-purple-light/60"
                aria-hidden="true"
                onPointerDown={(event) => startWindowInteraction('se', event)}
              />
            </>
          )}
        </section>
      )}

      <button
        className="fixed right-4 bottom-4 z-40 grid size-14 place-items-center rounded-full border border-purple-light/30 bg-purple/25 text-purple-light shadow-[0_12px_38px_rgba(0,0,0,.48),0_0_28px_rgba(155,123,255,.16),inset_0_1px_0_rgba(255,255,255,.16)] backdrop-blur-xl transition-[transform,background-color,border-color] hover:scale-105 hover:border-purple-light/45 hover:bg-purple/35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-light md:right-6 md:bottom-6"
        type="button"
        aria-label={open ? t('chat.close') : t('chat.open')}
        aria-expanded={open}
        onClick={toggleChat}
      >
        {open ? <CloseIcon size={22} /> : <MessageCircleIcon size={25} />}
        {!open && unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 grid min-h-5 min-w-5 place-items-center rounded-full border-2 border-canvas bg-lime px-1 text-[10px] font-black text-[#11140a]">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
    </>
  )
}
