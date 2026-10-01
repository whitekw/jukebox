import {
  Fragment,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { History, MessageCircleMore as MessageCircleIcon, Send as SendIcon, X as CloseIcon } from 'lucide-react'
import {
  getErrorMessage,
  useI18n,
  type Translate,
} from '../../../shared/i18n/i18n-context'
import {
  buttonStyles,
  chromeIconButtonStyles,
  cn,
  formControlStyles,
  panelCloseButtonStyles,
  panelStyles,
} from '../../../shared/styles'
import type { ChatMessage, RoomParticipant } from '../types'
import { useChatWindow } from './useChatWindow'
import { groupChatMessages } from './groupChatMessages'

type SystemChatMessage = Extract<ChatMessage, { type: 'system' }>

type ChatPanelProps = {
  roomCode: string
  messages: ChatMessage[]
  participants: RoomParticipant[]
  currentParticipantId: string
  onSend: (content: string) => Promise<void>
  triggerContainer?: HTMLElement | null
  mobileTriggerContainer?: HTMLElement | null
  hideMobileFloatingTrigger?: boolean
  onMobileTriggerClick?: () => void
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
  participants,
  currentParticipantId,
  onSend,
  triggerContainer,
  mobileTriggerContainer,
  hideMobileFloatingTrigger = false,
  onMobileTriggerClick,
}: ChatPanelProps) {
  const { locale, t } = useI18n()
  const [open, setOpen] = useState(false)
  const [activeView, setActiveView] = useState<'conversation' | 'logs'>('conversation')
  const [hasOpened, setHasOpened] = useState(false)
  const [lastReadSequence, setLastReadSequence] = useState(0)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<unknown>(null)
  const { isDesktop, chatWindowStyle, startWindowInteraction } = useChatWindow()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const messageListRef = useRef<HTMLDivElement>(null)
  const visibleMessages = useMemo(() => messages.filter((message) =>
    activeView === 'conversation' ? message.type === 'message' : message.type === 'system'),
  [messages, activeView])
  const messageGroups = useMemo(() => groupChatMessages(visibleMessages), [visibleMessages])
  const avatars = useMemo(() => new Map(participants.map(({ id, avatarUrl }) => [id, avatarUrl])), [participants])
  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
      }),
    [locale],
  )
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
    [locale],
  )
  const latestSequence = messages.at(-1)?.sequence ?? 0
  const latestVisibleSequence = visibleMessages.at(-1)?.sequence ?? 0
  const unreadCount = hasOpened
    ? messages.filter(
        (message) =>
          message.type === 'message' &&
          message.sequence > lastReadSequence &&
          message.participantId !== currentParticipantId,
      ).length
    : 0

  useEffect(() => {
    const dialog = dialogRef.current
    if (!open || !dialog) return
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (isDesktop) dialog.show()
    else dialog.showModal()

    const closeOnEscape = (event: KeyboardEvent) => {
      if (!isDesktop || event.key !== 'Escape' || event.defaultPrevented || event.isComposing ||
        document.querySelector('dialog:modal')) return
      event.preventDefault()
      dialog.close()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      const restoreFocus = dialog.contains(document.activeElement)
      document.removeEventListener('keydown', closeOnEscape)
      dialog.close()
      if (restoreFocus) trigger?.focus({ preventScroll: true })
    }
  }, [open, isDesktop])

  useEffect(() => {
    if (open && activeView === 'conversation') setLastReadSequence(latestSequence)
  }, [latestSequence, open, activeView])

  useEffect(() => {
    if (!open) return
    const messageList = messageListRef.current
    if (messageList) messageList.scrollTop = messageList.scrollHeight
  }, [latestVisibleSequence, open, activeView])

  useEffect(() => window.bsideDesktop?.onOpenChat((code) => {
    if (code !== roomCode) return
    setActiveView('conversation')
    setOpen(true)
    setHasOpened(true)
  }), [roomCode])

  function toggleChat() {
    setOpen((current) => {
      const next = !current
      if (next) {
        setHasOpened(true)
        setActiveView('conversation')
      }
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

  function renderTrigger(className: string, iconSize: number, beforeToggle?: () => void) {
    return (
      <button
        className={className}
        type="button"
        aria-label={open ? t('chat.close') : t('chat.open')}
        title={open ? t('chat.close') : t('chat.open')}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => { beforeToggle?.(); toggleChat() }}
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
        <dialog
          ref={dialogRef}
          className={cn(
            panelStyles({ padding: 'none' }),
            'fixed inset-auto z-[70] m-0 flex max-h-none max-w-none flex-col overflow-hidden rounded-t-2xl rounded-b-none bg-[#15121b] p-0 text-ink shadow-[0_16px_48px_rgba(0,0,0,.4)] backdrop:bg-black/40 backdrop:backdrop-blur-[2px] md:rounded-xl [&:not([open])]:hidden',
          )}
          style={chatWindowStyle}
          aria-labelledby={titleId}
          aria-modal={!isDesktop || undefined}
          onClose={(event) => {
            if (!event.currentTarget.open) setOpen(false)
          }}
          onClick={(event) => {
            if (isDesktop || event.target !== event.currentTarget) return
            const bounds = event.currentTarget.getBoundingClientRect()
            if (event.clientX < bounds.left || event.clientX > bounds.right ||
              event.clientY < bounds.top || event.clientY > bounds.bottom) event.currentTarget.close()
          }}
        >
          {!isDesktop && <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-white/15" aria-hidden="true" />}
          <header
            className={cn(
              'flex h-12 shrink-0 items-center justify-between gap-3 border-b border-line px-3',
              isDesktop && 'cursor-move touch-none select-none',
            )}
            onPointerDown={(event) => startWindowInteraction('move', event)}
          >
            <div className="flex min-w-0 items-center gap-2">
              <MessageCircleIcon size={16} className="text-muted" aria-hidden="true" />
              <h2 id={titleId} className="m-0 text-sm font-semibold">{t('chat.title')}</h2>
            </div>
            <div role="group" aria-label={t('chat.view')} className="flex shrink-0 items-center rounded-lg border border-line bg-white/[0.035] p-0.5">
              {(['conversation', 'logs'] as const).map((view) => <button key={view} type="button"
                aria-pressed={activeView === view} onClick={() => setActiveView(view)}
                className={cn(
                  'relative rounded-md px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-purple-light',
                  activeView === view ? 'bg-purple/25 text-purple-light' : 'text-muted hover:text-ink',
                )}>
                {t(view === 'conversation' ? 'chat.conversation' : 'chat.logs')}
                {view === 'conversation' && activeView === 'logs' && unreadCount > 0 &&
                  <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-lime" aria-hidden="true" />}
              </button>)}
            </div>
            <button
              className={panelCloseButtonStyles}
              type="button"
              aria-label={t('chat.close')}
              onClick={() => dialogRef.current?.close()}
            >
              <CloseIcon size={17} />
            </button>
          </header>

          <div className="flex min-h-0 flex-1 flex-col px-3 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] md:pb-3">
            <div
              ref={messageListRef}
              className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain py-1 pr-1 [scrollbar-width:thin] [scrollbar-color:var(--color-dim)_transparent]"
              role="log"
              aria-label={t(activeView === 'conversation' ? 'chat.conversation' : 'chat.logs')}
              aria-live={activeView === 'conversation' ? 'polite' : 'off'}
            >
              {visibleMessages.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-xs text-muted">
                  {activeView === 'conversation'
                    ? <MessageCircleIcon size={28} className="text-purple-light/60" aria-hidden="true" />
                    : <History size={28} className="text-purple-light/60" aria-hidden="true" />}
                  <p>{t(activeView === 'conversation' ? 'chat.empty' : 'chat.logsEmpty')}</p>
                </div>
              ) : (
                messageGroups.map((group, index) => {
                  const firstMessageAt = group.type === 'system' ? group.createdAt : group.messages[0].createdAt
                  const previousGroup = messageGroups[index - 1]
                  const previousMessageAt = previousGroup?.type === 'system'
                    ? previousGroup.createdAt : previousGroup?.messages[0].createdAt
                  const dateDivider = (previousMessageAt === undefined ||
                    new Date(firstMessageAt).toDateString() !== new Date(previousMessageAt).toDateString()) && (
                    <div className="my-1 flex items-center gap-2.5 text-[11px] font-medium text-muted">
                      <span className="h-px min-w-0 flex-1 bg-line" aria-hidden="true" />
                      <time className="shrink-0" dateTime={new Date(firstMessageAt).toISOString()}>
                        {dateFormatter.format(firstMessageAt)}
                      </time>
                      <span className="h-px min-w-0 flex-1 bg-line" aria-hidden="true" />
                    </div>
                  )
                  if (group.type === 'system') {
                    return (
                      <Fragment key={group.id}>
                        {dateDivider}
                        <div className="flex items-start gap-2 rounded-lg border border-line/50 bg-white/[0.025] px-3 py-2 text-[11px] leading-4 text-muted [overflow-wrap:anywhere]">
                          <span className="mt-1 size-1.5 shrink-0 rounded-full bg-purple-light/55" aria-hidden="true" />
                          <p className="m-0 min-w-0 flex-1">
                            {formatSystemMessage(group, t)}
                          </p>
                          <time className="shrink-0 whitespace-nowrap text-[10px] text-dim"
                            dateTime={new Date(group.createdAt).toISOString()}>
                            {timeFormatter.format(group.createdAt)}
                          </time>
                        </div>
                      </Fragment>
                    )
                  }
                  const message = group.messages[0]
                  const isMine = message.participantId === currentParticipantId
                  const avatarUrl = avatars.get(message.participantId)
                  return (
                    <Fragment key={group.id}>
                      {dateDivider}
                      <article
                        className={cn(
                          'flex max-w-[92%] shrink-0 items-start gap-2',
                          isMine ? 'self-end' : 'self-start',
                        )}
                      >
                      {!isMine && <span className="mt-0.5 grid size-7 shrink-0 place-items-center overflow-hidden rounded-full border border-purple/25 bg-purple/[0.08] text-[10px] font-bold text-purple-light" aria-hidden="true">
                        {avatarUrl
                          ? <img className="size-full object-cover" src={avatarUrl} alt="" />
                          : message.nickname.trim().slice(0, 1).toUpperCase()}
                      </span>}
                      <div className={cn('flex min-w-0 flex-col gap-1', isMine ? 'items-end' : 'items-start')}>
                        <div className="flex max-w-full items-center gap-2 px-0.5 text-[10px] text-dim">
                          {!isMine && (
                            <strong className="max-w-36 truncate font-extrabold text-muted">
                              {message.nickname}
                            </strong>
                          )}
                          <time className="shrink-0" dateTime={new Date(message.createdAt).toISOString()}>
                            {timeFormatter.format(message.createdAt)}
                          </time>
                        </div>
                        {group.messages.map((entry) => (
                          <p
                            key={entry.id}
                            className={cn(
                              'm-0 max-w-full whitespace-pre-wrap rounded-lg border px-2.5 py-1.5 text-[13px] leading-5 [overflow-wrap:anywhere]',
                              isMine
                                ? 'rounded-br-sm border-purple/20 bg-purple/20 text-ink'
                                : 'rounded-bl-sm border-line bg-white/[0.035] text-ink',
                            )}
                            title={timeFormatter.format(entry.createdAt)}
                          >
                            {entry.content}
                          </p>
                        ))}
                      </div>
                      </article>
                    </Fragment>
                  )
                })
              )}
            </div>

            {activeView === 'conversation' && <form className="mt-3 flex items-center gap-2" onSubmit={send}>
              <input
                className={cn(formControlStyles(), 'min-w-0 rounded-lg px-3 text-sm placeholder:text-muted/70')}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={300}
                placeholder={t('chat.placeholder')}
                aria-label={t('chat.placeholder')}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault()
                }}
              />
              <button
                className={cn(
                  buttonStyles({ intent: 'outline', size: 'md' }),
                  'size-11 min-h-11 shrink-0 rounded-lg border-purple/25 bg-purple/20 px-0 text-purple-light enabled:hover:bg-purple/30 disabled:border-transparent disabled:bg-white/[0.035] disabled:text-dim disabled:opacity-100',
                )}
                type="submit"
                disabled={sending || draft.trim().length === 0}
                aria-label={sending ? t('chat.sending') : t('chat.send')}
              >
                <SendIcon size={18} aria-hidden="true" />
              </button>
            </form>}
            {activeView === 'conversation' && sendError !== null && (
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
        </dialog>
      )}

      {triggerContainer && createPortal(renderTrigger(cn(
        'relative grid size-11 shrink-0 place-items-center rounded-[4px] border border-purple-light/25 text-purple-light transition-colors hover:border-purple-light/45 hover:bg-purple/35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-light',
        open ? 'bg-purple/55 text-white' : 'bg-purple-light/20',
      ), 21), triggerContainer)}
      {mobileTriggerContainer && createPortal(renderTrigger(
        cn(chromeIconButtonStyles, 'relative text-white'),
        19,
        onMobileTriggerClick,
      ), mobileTriggerContainer)}
      {renderTrigger(cn(
        'fixed right-4 bottom-[128px] z-[70] grid size-14 place-items-center rounded-[4px] border border-purple-light/30 bg-purple/25 text-purple-light shadow-[0_12px_38px_rgba(0,0,0,.48),0_0_28px_rgba(155,123,255,.16),inset_0_1px_0_rgba(255,255,255,.16)] backdrop-blur-xl transition-[transform,background-color,border-color] hover:scale-105 hover:border-purple-light/45 hover:bg-purple/35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-light sm:right-6 sm:bottom-[92px]',
        triggerContainer && 'sm:hidden',
        hideMobileFloatingTrigger && 'max-[639px]:hidden',
      ), 25)}
    </>
  )
}
