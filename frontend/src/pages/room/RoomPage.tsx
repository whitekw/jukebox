import { useEffect, useMemo, useState, type FormEvent } from 'react'
import QRCode from 'react-qr-code'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ApiError,
  api,
  clearStoredRoomCredentials,
  hostTokenKey,
  normalizeRoomCode,
  participantTokenKey,
} from '../../api'
import { Brand } from '../../components/Brand'
import { AccountMenu } from '../../components/AccountMenu'
import { useAuth } from '../../auth'
import { CopyIcon, MusicIcon } from '../../components/Icons'
import { YouTubePlayer } from '../../components/YouTubePlayer'
import { getErrorMessage, useI18n } from '../../i18n-context'
import {
  buttonStyles,
  cardIconStyles,
  cn,
  connectionDotStyles,
  formControlStyles,
  noticeStyles,
  pageMessageStyles,
  sectionKickerStyles,
} from '../../styles'
import type { Participant } from '../../types'
import { useRoomState } from '../../useRoomState'
import { NowPlaying } from './NowPlaying'
import { ChatPanel } from './ChatPanel'
import { ParticipantsMenu } from './ParticipantsMenu'
import { QueuePanel } from './QueuePanel'
import { SearchPanel } from './SearchPanel'

export function RoomPage() {
  const { t } = useI18n()
  const { user } = useAuth()
  const params = useParams()
  const navigate = useNavigate()
  const code = normalizeRoomCode(params.code)
  const hostToken = localStorage.getItem(hostTokenKey(code)) ?? ''
  const isHost = Boolean(hostToken)
  const [participantToken, setParticipantToken] = useState(
    () => localStorage.getItem(participantTokenKey(code)) ?? '',
  )
  const {
    room,
    setRoom,
    loading,
    connected,
    serverTimeOffsetMs,
    chatMessages,
    appendChatMessage,
    deleted,
    error: roomError,
  } = useRoomState(code, hostToken, participantToken)
  const [participant, setParticipant] = useState<Participant | null>(null)
  const [participantLoading, setParticipantLoading] = useState(
    () => Boolean(participantToken),
  )
  const [isOwner, setIsOwner] = useState(false)
  const [nickname, setNickname] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const joinUrl = useMemo(() => `${window.location.origin}/room/${code}`, [code])

  useEffect(() => {
    if (!deleted) return
    clearStoredRoomCredentials(code)
    navigate('/', { replace: true, state: { roomDeleted: true } })
  }, [code, deleted, navigate])

  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(''), 3_000)
    return () => window.clearTimeout(timer)
  }, [message])

  useEffect(() => {
    if (!participantToken) {
      setParticipantLoading(false)
      return
    }
    let active = true
    setParticipantLoading(true)
    void api
      .getMe(code, participantToken)
      .then((me) => {
        if (active) setParticipant(me)
      })
      .catch(() => {
        if (!active) return
        localStorage.removeItem(participantTokenKey(code))
        setParticipantToken('')
        setParticipant(null)
      })
      .finally(() => {
        if (active) setParticipantLoading(false)
      })
    return () => {
      active = false
    }
  }, [code, participantToken])

  useEffect(() => {
    if (!user) {
      setIsOwner(false)
      return
    }
    let active = true
    void api
      .getRoomSession(code, {
        ...(hostToken ? { hostToken } : {}),
        ...(participantToken ? { participantToken } : {}),
      })
      .then((session) => {
        if (active) setIsOwner(session.isOwner)
      })
      .catch(() => {
        if (active) setIsOwner(false)
      })
    return () => {
      active = false
    }
  }, [code, hostToken, participantToken, user])

  useEffect(() => {
    if (!user) return
    setNickname((current) => current || user.displayName.slice(0, 20))
  }, [user])

  const isManager =
    Boolean(participant) &&
    Boolean(
      room?.participants.find(
        (roomParticipant) => roomParticipant.id === participant?.id,
      )?.isManager,
    )
  const controlCredentials = hostToken
    ? {
        hostToken,
        ...(participantToken ? { participantToken } : {}),
      }
    : isOwner
      ? participantToken
        ? { participantToken }
        : {}
      : isManager && participantToken
      ? { participantToken }
      : null
  const isController = controlCredentials !== null
  const songActionCredentials = hostToken
    ? {
        hostToken,
        ...(participantToken ? { participantToken } : {}),
      }
    : participantToken
      ? { participantToken }
      : null

  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    try {
      const joined = await api.joinRoom(code, nickname)
      localStorage.setItem(participantTokenKey(code), joined.participantToken)
      setParticipantToken(joined.participantToken)
      setParticipant(joined.participant)
      setRoom(joined.room)
    } catch (requestError) {
      setError(getErrorMessage(requestError, t))
    }
  }

  async function addSong(videoId: string) {
    if (!participantToken) return
    const startsPlayingImmediately = !room?.currentSong
    setError('')
    setMessage('')
    try {
      setRoom(await api.addSong(code, participantToken, videoId))
      setMessage(
        startsPlayingImmediately
          ? t('room.firstSongPlaying')
          : t('room.addedToQueue'),
      )
    } catch (requestError) {
      setError(getErrorMessage(requestError, t))
    }
  }

  async function sendChatMessage(content: string) {
    if (!participantToken) return
    const chatMessage = await api.sendChatMessage(
      code,
      participantToken,
      content,
    )
    appendChatMessage(chatMessage)
  }

  async function runRoomAction(action: () => Promise<NonNullable<typeof room>>) {
    setRoom(await action())
  }

  async function runControllerAction(action: () => Promise<NonNullable<typeof room>>) {
    if (!controlCredentials) {
      throw new ApiError(403, '', 'CONTROL_FORBIDDEN')
    }
    await runRoomAction(action)
  }

  function runQueueAction(action: () => Promise<NonNullable<typeof room>>) {
    setError('')
    void runRoomAction(action).catch((requestError) => {
      setError(getErrorMessage(requestError, t))
    })
  }

  function reportPlaybackBlocked(blocked: boolean) {
    if (!hostToken) return
    void runControllerAction(() =>
      api.reportPlaybackBlocked(code, hostToken, blocked),
    ).catch((requestError) => setError(getErrorMessage(requestError, t)))
  }

  function reportPlaybackStarted(videoId: string, positionSeconds: number) {
    const playbackCredentials = participantToken
      ? { participantToken }
      : hostToken || null
    if (!playbackCredentials || room?.playbackMode !== 'all_devices') return
    void runRoomAction(() =>
      api.startPlayback(
        code,
        playbackCredentials,
        videoId,
        positionSeconds,
      ),
    ).catch((requestError) => setError(getErrorMessage(requestError, t)))
  }

  async function copyJoinLink() {
    await navigator.clipboard.writeText(joinUrl)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1_600)
  }

  if (loading) {
    return (
      <main className={pageMessageStyles}>
        <Brand className="absolute top-[26px] left-[30px]" />
        <h1 className="mt-4 text-[clamp(24px,4vw,38px)]">
          {t('room.connecting')}
        </h1>
      </main>
    )
  }
  if (!room) {
    return (
      <main className={pageMessageStyles}>
        <Brand className="absolute top-[26px] left-[30px]" />
        <h1 className="mt-4 text-[clamp(24px,4vw,38px)]">
          {roomError || t('room.roomNotFound')}
        </h1>
        <Link className={buttonStyles({ intent: 'outline' })} to="/">
          {t('common.home')}
        </Link>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-canvas bg-[radial-gradient(circle_at_15%_20%,rgba(96,72,163,.17),transparent_30%)] px-3 pt-[17px] pb-20 md:px-[clamp(18px,3vw,46px)] md:pt-[22px]">
      <header className="relative z-[60] mx-auto mb-[22px] flex max-w-[1500px] items-center justify-between">
        <Brand compactOnMobile />
        <div className="flex items-center gap-2">
          <AccountMenu compact />
          <div className="flex items-center gap-[9px] text-[11px] font-bold tracking-[0.08em] text-dim">
            <span className={connectionDotStyles({ connected })} />
            ROOM <strong>{code}</strong>
          </div>
          {(participant || isHost || isOwner) && (
            <ParticipantsMenu
              participants={room.participants}
              currentParticipantId={participant?.id}
              onSetManager={
                isManager || isOwner
                  ? (targetParticipantId, nextIsManager) =>
                      runControllerAction(() =>
                        api.setManager(
                          code,
                          controlCredentials!,
                          targetParticipantId,
                          nextIsManager,
                        ),
                      )
                  : undefined
              }
            />
          )}
        </div>
      </header>

      <section className="mx-auto grid max-w-[1500px] gap-4">
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.8fr)_minmax(340px,.8fr)] lg:items-stretch">
          <NowPlaying
            song={room.currentSong}
            paused={room.playbackPaused}
            blocked={
              room.playbackMode === 'host_only' && room.playbackBlocked
            }
            player={
              (isHost ||
                (Boolean(participant) && room.playbackMode === 'all_devices')) &&
              room.currentSong ? (
                <YouTubePlayer
                  videoId={room.currentSong.videoId}
                  volume={room.playbackMode === 'host_only' ? room.hostVolume : 100}
                  paused={room.playbackPaused}
                  playbackBlocked={
                    isHost && room.playbackMode === 'host_only'
                      ? room.playbackBlocked
                      : false
                  }
                  onPlaybackBlockedChange={
                    isHost && room.playbackMode === 'host_only'
                      ? reportPlaybackBlocked
                      : undefined
                  }
                  onPlaybackStarted={
                    (participant || isHost) &&
                    room.playbackMode === 'all_devices'
                      ? reportPlaybackStarted
                      : undefined
                  }
                  onEnded={
                    isHost && room.playbackMode === 'host_only'
                      ? () =>
                          runQueueAction(() =>
                            api.advance(code, hostToken),
                          )
                      : undefined
                  }
                  synchronization={
                    room.playbackMode === 'all_devices'
                      ? {
                          positionSeconds: room.playbackPositionSeconds,
                          anchorAt: room.playbackAnchorAt,
                          revision: room.playbackRevision,
                          serverTimeOffsetMs,
                          pending: room.playbackPending,
                        }
                      : undefined
                  }
                />
              ) : undefined
            }
            onAdvance={
              songActionCredentials &&
              room.currentSong &&
              (isController || room.currentSong.addedById === participant?.id)
                ? () =>
                    runQueueAction(() =>
                      api.advance(code, songActionCredentials),
                    )
                : undefined
            }
            onGlobalPlaybackToggle={
              isController
                ? () =>
                    runQueueAction(() =>
                      api.setPlaybackPaused(
                        code,
                        controlCredentials,
                        !room.playbackPaused,
                      ),
                    )
                : undefined
            }
          />
          <div className="min-w-0 lg:relative lg:min-h-0">
            <QueuePanel
              className="h-full lg:absolute lg:inset-0 lg:overflow-hidden"
              songs={room.queue}
              onReorder={
                isController
                  ? (songId, targetIndex) =>
                      runQueueAction(() =>
                        api.reorderSong(
                          code,
                          controlCredentials,
                          songId,
                          targetIndex,
                        ),
                      )
                  : undefined
              }
              onRemove={
                songActionCredentials
                  ? (songId) =>
                      runQueueAction(() =>
                        api.removeSong(
                          code,
                          songActionCredentials,
                          songId,
                        ),
                      )
                  : undefined
              }
              canRemove={(song) =>
                isController || song.addedById === participant?.id
              }
            />
          </div>
        </div>
        {participant && (
          <SearchPanel onAddSong={addSong} />
        )}
        {participant && (
          <ChatPanel
            messages={chatMessages}
            currentParticipantId={participant.id}
            onSend={sendChatMessage}
          />
        )}
        {(isHost || isOwner) && (
          <section className="flex flex-col items-center gap-5 rounded-2xl border border-line bg-[linear-gradient(90deg,rgba(155,123,255,.10),rgba(255,255,255,.025))] px-5 py-5 text-center sm:grid sm:grid-cols-[auto_1fr_auto] sm:text-left">
            <div className="grid place-items-center rounded-[9px] bg-white p-[7px]">
              <QRCode value={joinUrl} size={88} />
            </div>
            <div className="min-w-0">
              <span className={sectionKickerStyles}>JOIN THE ROOM</span>
              <h2 className="my-[5px] text-lg">{t('host.scanDescription')}</h2>
              <p className="m-0 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-dim">
                {joinUrl}
              </p>
            </div>
            <button
              className={cn(
                buttonStyles({ intent: 'outline', size: 'md' }),
                'shrink-0',
              )}
              type="button"
              onClick={() => void copyJoinLink()}
            >
              <CopyIcon size={16} />
              <span className="font-black tracking-[0.14em]">{code}</span>
            </button>
          </section>
        )}
      </section>

      {!participant && !participantLoading && (
        <div className="fixed inset-0 z-20 grid place-items-center bg-[#040307]/75 p-5 backdrop-blur-[18px]">
          <form
            className="relative flex w-full max-w-[420px] flex-col rounded-[18px] border border-purple/30 bg-[#121017] p-6 shadow-[0_30px_100px_rgba(0,0,0,.5)] md:p-[30px]"
            onSubmit={join}
          >
            <div className={cardIconStyles()}><MusicIcon size={25} /></div>
            <span className={sectionKickerStyles}>WELCOME TO {code}</span>
            <h1 className="mt-2.5 mb-2 text-[27px] tracking-[-0.04em]">
              {t('room.askNickname')}
            </h1>
            <p className="mb-7 text-[13px] text-muted">
              {t('room.nicknameDescription')}
            </p>
            <label
              className="mb-2 text-[11px] font-extrabold tracking-[0.12em] text-dim uppercase"
              htmlFor="nickname"
            >
              {t('room.nicknameLabel')}
            </label>
            <input
              className={cn(formControlStyles({ size: 'large' }), 'mb-3')}
              id="nickname"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              minLength={2}
              maxLength={20}
              autoFocus
              required
            />
            <button
              className={buttonStyles({
                intent: 'primary',
                size: 'lg',
                spread: true,
                fullWidth: true,
              })}
              type="submit"
            >
              {t('room.enter')} <span>→</span>
            </button>
          </form>
        </div>
      )}

      {(error || roomError) && (
        <div className={noticeStyles({ tone: 'error' })}>
          {error || roomError}
        </div>
      )}
      {message && (
        <div
          className={noticeStyles({ tone: 'success' })}
          role="status"
          aria-live="polite"
        >
          {message}
        </div>
      )}
      {copied && (
        <div className={noticeStyles({ tone: 'success' })}>
          {t('host.linkCopied')}
        </div>
      )}
    </main>
  )
}
