import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { CloseIcon, MessageCircleIcon } from '../../components/Icons'
import { getErrorMessage, useI18n } from '../../i18n-context'
import {
  buttonStyles,
  cn,
  formControlStyles,
  panelStyles,
  sectionKickerStyles,
} from '../../styles'
import type { ChatMessage } from '../../types'

type ChatPanelProps = {
  messages: ChatMessage[]
  currentParticipantId: string
  onSend: (content: string) => Promise<void>
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

  return (
    <>
      {open && (
        <section
          className={cn(
            panelStyles({ padding: 'none' }),
            'fixed right-3 bottom-[84px] z-40 flex h-[min(560px,calc(100dvh-104px))] w-[calc(100vw-24px)] max-w-[400px] flex-col overflow-hidden bg-[#110f16]/95 shadow-[0_24px_80px_rgba(0,0,0,.55)] backdrop-blur-xl md:right-6 md:bottom-[96px]',
          )}
          role="dialog"
          aria-label={t('chat.title')}
        >
          <header className="flex items-center justify-between gap-4 border-b border-line px-4 py-4 md:px-[18px]">
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
        </section>
      )}

      <button
        className="fixed right-4 bottom-4 z-40 grid size-14 place-items-center rounded-full bg-purple-light text-[#110d19] shadow-[0_12px_38px_rgba(0,0,0,.48),0_0_24px_rgba(155,123,255,.20)] transition-[transform,background-color] hover:scale-105 hover:bg-[#d2c4ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-light md:right-6 md:bottom-6"
        type="button"
        aria-label={open ? t('chat.close') : t('chat.open')}
        aria-expanded={open}
        onClick={toggleChat}
      >
        {open ? <CloseIcon size={23} /> : <MessageCircleIcon size={24} />}
        {!open && unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 grid min-h-5 min-w-5 place-items-center rounded-full border-2 border-canvas bg-lime px-1 text-[10px] font-black text-[#11140a]">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
    </>
  )
}
