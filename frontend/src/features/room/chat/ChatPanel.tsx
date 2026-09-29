import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { MessageCircleMore as MessageCircleIcon, Send as SendIcon, X as CloseIcon } from 'lucide-react'
import {
  getErrorMessage,
  useI18n,
  type Translate,
} from '../../../shared/i18n/i18n-context'
import {
  buttonStyles,
  cn,
  formControlStyles,
  panelStyles,
  sectionKickerStyles,
} from '../../../shared/styles'
import type { ChatMessage } from '../types'
import { useChatWindow } from './useChatWindow'

type SystemChatMessage = Extract<ChatMessage, { type: 'system' }>

type ChatPanelProps = {
  roomCode: string
  messages: ChatMessage[]
  currentParticipantId: string
  onSend: (content: string) => Promise<void>
  triggerContainer?: HTMLElement | null
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
    case 'manager_added':
      return message.data.automatic
        ? t('chat.event.managerAutoAdded', { target })
        : t('chat.event.managerAdded', { actor, target })
    case 'manager_removed':
      return t('chat.event.managerRemoved', { actor, target })
  }
}

export function ChatPanel({
  roomCode,
  messages,
  currentParticipantId,
  onSend,
  triggerContainer,
}: ChatPanelProps) {
  const { locale, t } = useI18n()
  const [open, setOpen] = useState(false)
  const [hasOpened, setHasOpened] = useState(false)
  const [lastReadSequence, setLastReadSequence] = useState(0)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<unknown>(null)
  const { isDesktop, chatWindowStyle, startWindowInteraction } = useChatWindow()
  const messageListRef = useRef<HTMLDivElement>(null)
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
  useEffect(() => {
    if (!open) return
    setLastReadSequence(latestSequence)
    const messageList = messageListRef.current
    if (messageList) messageList.scrollTop = messageList.scrollHeight
  }, [latestSequence, open])

  useEffect(() => window.bsideDesktop?.onOpenChat((code) => {
    if (code !== roomCode) return
    setOpen(true)
    setHasOpened(true)
  }), [roomCode])

  function toggleChat() {
    setOpen((current) => {
      const next = !current
      if (next) setHasOpened(true)
      return next
    })
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

  function renderTrigger(className: string, iconSize: number) {
    return (
      <button
        className={className}
        type="button"
        aria-label={open ? t('chat.close') : t('chat.open')}
        title={open ? t('chat.close') : t('chat.open')}
        aria-expanded={open}
        onClick={toggleChat}
      >
        {open ? <CloseIcon size={iconSize} /> : <MessageCircleIcon size={iconSize} />}
        {!open && unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 grid min-h-5 min-w-5 place-items-center rounded-full border-2 border-canvas bg-lime px-1 text-[10px] font-black text-[#11140a]">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
    )
  }

  return (
    <>
      {open && (
        <section
          className={cn(
            panelStyles({ padding: 'none' }),
            'fixed right-3 bottom-[155px] z-[70] flex h-[min(560px,calc(100dvh-175px))] w-[calc(100vw-24px)] max-w-[400px] flex-col overflow-hidden bg-[#110f16]/95 shadow-[0_24px_80px_rgba(0,0,0,.55)] backdrop-blur-xl md:right-auto md:bottom-auto md:h-auto md:w-auto md:max-w-none',
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
                className={cn(formControlStyles(), 'min-w-0')}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={300}
                placeholder={t('chat.placeholder')}
                aria-label={t('chat.placeholder')}
              />
              <button
                className={cn(
                  buttonStyles({ intent: 'primary', size: 'md' }),
                  'size-11 min-h-11 shrink-0 px-0',
                )}
                type="submit"
                disabled={sending || draft.trim().length === 0}
                aria-label={sending ? t('chat.sending') : t('chat.send')}
              >
                <SendIcon size={20} />
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

      {triggerContainer && createPortal(renderTrigger(cn(
        'relative grid size-11 shrink-0 place-items-center rounded-[4px] border border-purple-light/25 text-purple-light transition-colors hover:border-purple-light/45 hover:bg-purple/35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-light',
        open ? 'bg-purple/55 text-white' : 'bg-purple-light/20',
      ), 21), triggerContainer)}
      {renderTrigger(cn(
        'fixed right-4 bottom-[92px] z-[70] grid size-14 place-items-center rounded-[4px] border border-purple-light/30 bg-purple/25 text-purple-light shadow-[0_12px_38px_rgba(0,0,0,.48),0_0_28px_rgba(155,123,255,.16),inset_0_1px_0_rgba(255,255,255,.16)] backdrop-blur-xl transition-[transform,background-color,border-color] hover:scale-105 hover:border-purple-light/45 hover:bg-purple/35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-light md:right-6 md:bottom-[92px]',
        triggerContainer && 'lg:hidden',
      ), 25)}
    </>
  )
}
