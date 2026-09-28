import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { roomApi } from '../api'
import { Brand } from '../../../shared/ui/Brand'
import { AccountMenu } from '../../auth/components/AccountMenu'
import { useAuth } from '../../auth/context'
import { YouTubePlayer } from '../playback/YouTubePlayer'
import { getErrorMessage, useI18n } from '../../../shared/i18n/i18n-context'
import {
  buttonStyles,
  connectionDotStyles,
  noticeStyles,
  pageMessageStyles,
} from '../../../shared/styles'
import { useRoomState } from '../hooks/useRoomState'
import { NowPlaying } from '../components/NowPlaying'
import { ChatPanel } from '../chat/ChatPanel'
import { ParticipantsMenu } from '../components/ParticipantsMenu'
import { QueuePanel } from '../components/QueuePanel'
import { SearchPanel } from '../components/SearchPanel'
import { InviteRoomButton } from '../components/InviteRoomButton'
import { RoomJoinPreview } from '../components/RoomJoinPreview'
import { RoomSettingsButton } from '../components/RoomSettingsButton'
import { canControlSong, getRoomPermissions } from '../roomPermissions'
import { useRoomSession } from '../hooks/useRoomSession'
import { clearStoredRoomCredentials, normalizeRoomCode } from '../roomCredentials'
import { useRoomActions } from '../hooks/useRoomActions'

export function RoomPage() {
  const { t } = useI18n()
  const { user, loading: authLoading } = useAuth()
  const params = useParams()
  const navigate = useNavigate()
  const code = normalizeRoomCode(params.code)
  const onMembershipLeft = useCallback(() => {
    clearStoredRoomCredentials(code)
    navigate('/', { replace: true })
  }, [code, navigate])
  const onDisconnected = useCallback(() => {
    navigate('/', { replace: true, state: { roomDisconnected: true } })
  }, [navigate])
  const {
    hostToken,
    isHost,
    participantToken,
    participant,
    participantLoading,
    participantError,
    retryResume,
    isOwner,
    claimingHost,
    resumeClaimedPlayback,
    revokeHost,
    joinRoom,
    claimPlaybackHost: claimPlaybackHostSession,
  } = useRoomSession(code, user)
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
  } = useRoomState(code, hostToken, participantToken, revokeHost, onMembershipLeft, user?.id ?? '', onDisconnected, participant?.id)
  const [nickname, setNickname] = useState('')
  const [joining, setJoining] = useState(false)
  const [songControlTick, setSongControlTick] = useState(0)
  const wasAuthenticated = useRef(false)
  const joinUrl = useMemo(() => `${window.location.origin}/room/${code}`, [code])
  const serverNow = Date.now() + serverTimeOffsetMs

  useEffect(() => {
    if (!room) return
    const currentTime = Date.now() + serverTimeOffsetMs
    const nextAvailableAt = [room.currentSong, ...room.queue].reduce(
      (next, song) => {
        const availableAt = song?.otherControlAvailableAt
        return availableAt != null && availableAt > currentTime
          ? Math.min(next, availableAt)
          : next
      },
      Infinity,
    )
    if (!Number.isFinite(nextAvailableAt)) return
    const timer = window.setTimeout(
      () => setSongControlTick((tick) => tick + 1),
      Math.min(nextAvailableAt - currentTime + 50, 2_147_483_647),
    )
    return () => window.clearTimeout(timer)
  }, [room, serverTimeOffsetMs, songControlTick])

  useEffect(() => {
    if (authLoading) return
    if (user) {
      wasAuthenticated.current = true
      return
    }
    if (!wasAuthenticated.current) return
    wasAuthenticated.current = false
    navigate('/', { replace: true, state: { loggedOut: true } })
  }, [authLoading, navigate, user])

  useEffect(() => {
    if (!deleted) return
    clearStoredRoomCredentials(code)
    navigate('/', { replace: true, state: { roomDeleted: true } })
  }, [code, deleted, navigate])

  useEffect(() => {
    if (!user) return
    setNickname((current) => current || user.displayName.slice(0, 20))
  }, [user])

  const {
    isManager,
    isController,
    controlCredentials,
    songActionCredentials,
  } = getRoomPermissions({
    room,
    participant,
    hostToken,
    participantToken,
    isOwner,
  })
  const {
    message,
    error,
    setError,
    addSong,
    sendChatMessage,
    runControllerAction,
    runQueueAction,
    reportPlaybackBlocked,
    reportPlaybackStarted,
    claimPlaybackHost,
  } = useRoomActions({
    code,
    room,
    setRoom,
    hostToken,
    participantToken,
    controlCredentials,
    appendChatMessage,
    claimPlaybackHostSession,
  })

  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (joining) return
    setError('')
    setJoining(true)
    try {
      setRoom(await joinRoom(user ? user.displayName.slice(0, 20) : nickname))
    } catch (requestError) {
      setError(getErrorMessage(requestError, t))
    } finally {
      setJoining(false)
    }
  }

  async function leaveRoom() {
    if (!window.confirm(t('home.leaveRoomConfirm', { code }))) return
    try {
      await roomApi.leaveRoom(code)
      clearStoredRoomCredentials(code)
      navigate('/')
    } catch (requestError) {
      setError(getErrorMessage(requestError, t))
    }
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
  if (authLoading || participantLoading) {
    return (
      <main className={pageMessageStyles}>
        <Brand className="absolute top-[26px] left-[30px]" />
        <h1 className="mt-4 text-[clamp(24px,4vw,38px)]">
          {t('room.connecting')}
        </h1>
      </main>
    )
  }
  if (!participant && !isHost) {
    return (
      <RoomJoinPreview
        room={room}
        user={user}
        nickname={nickname}
        onNicknameChange={setNickname}
        onJoin={join}
        joining={joining}
        joinError={error}
        participantError={participantError}
        onRetry={retryResume}
      />
    )
  }

  return (
    <main className="min-h-screen bg-canvas bg-[radial-gradient(circle_at_15%_20%,rgba(96,72,163,.17),transparent_30%)] px-3 pt-[17px] pb-20 md:px-[clamp(18px,3vw,46px)] md:pt-[22px]">
      <header className="relative z-[60] mx-auto mb-[22px] flex max-w-[1500px] flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-center gap-5">
          <Brand className="gap-2 text-base tracking-[0.14em] max-[380px]:[&>span]:hidden md:gap-3 md:text-lg md:tracking-[0.18em]" />
          <div className="flex min-w-0 items-center gap-2 border-l border-line pl-3 font-mono text-xs tracking-[0.08em] text-muted sm:pl-5">
            <span className={connectionDotStyles({ connected })} />
            <span className="max-w-[min(36vw,380px)] truncate text-ink" title={room.title}>{room.title}</span>
            <span className="hidden shrink-0 sm:inline">· {code}</span>
          </div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {(participant || isHost || isOwner) && (
            <ParticipantsMenu
              participants={room.participants}
              currentParticipantId={participant?.id}
              onLeave={participant?.isMember && !isOwner ? leaveRoom : undefined}
              onJoinAccount={user && participant && !participant.isMember
                ? async () => {
                    try {
                      setRoom(await joinRoom(user.displayName.slice(0, 20)))
                    } catch (requestError) {
                      setError(getErrorMessage(requestError, t))
                    }
                  }
                : undefined}
              onSetManager={
                controlCredentials && (isManager || isOwner)
                  ? (targetParticipantId, nextIsManager) =>
                      runControllerAction(() =>
                        roomApi.setManager(
                          code,
                          controlCredentials,
                          targetParticipantId,
                          nextIsManager,
                        ),
                      )
                  : undefined
              }
              onDisconnect={isOwner
                ? (targetParticipantId) => runControllerAction(() =>
                    roomApi.disconnectParticipant(code, targetParticipantId))
                : undefined}
            />
          )}
          <InviteRoomButton code={code} joinUrl={joinUrl} allowGuests={room.allowGuests} />
          {isOwner && (
            <RoomSettingsButton room={room} onSave={async (title, allowGuests) => {
              setRoom(await roomApi.updateRoomSettings(code, {}, { title, allowGuests }))
            }} />
          )}
          <AccountMenu
            compact
            logoutConfirmMessage={isHost && room.playbackMode === 'host_only'
              ? t('auth.logoutHostConfirm')
              : undefined}
          />
        </div>
      </header>

      <section className="mx-auto grid max-w-[1500px] gap-4">
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.8fr)_minmax(340px,.8fr)] lg:items-start">
          <div className="flex min-w-0 flex-col gap-4">
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
                              roomApi.advance(code, hostToken),
                            )
                        : undefined
                    }
                    synchronization={
                      room.playbackMode === 'all_devices' ||
                      (isHost && resumeClaimedPlayback)
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
              onClaimPlaybackHost={
                isOwner && !isHost && room.playbackMode === 'host_only'
                  ? () => void claimPlaybackHost()
                  : undefined
              }
              claimingPlaybackHost={claimingHost}
              onAdvance={
                songActionCredentials &&
                room.currentSong &&
                canControlSong(
                  room.currentSong,
                  participant?.id,
                  isController,
                  serverNow,
                )
                  ? () =>
                      runQueueAction(() =>
                        roomApi.advance(code, songActionCredentials),
                      )
                  : undefined
              }
              onGlobalPlaybackToggle={
                controlCredentials
                  ? () =>
                      runQueueAction(() =>
                        roomApi.setPlaybackPaused(
                          code,
                          controlCredentials,
                          !room.playbackPaused,
                        ),
                      )
                  : undefined
              }
            />
            {participant && (
              <SearchPanel onAddSong={addSong} />
            )}
          </div>
          <div className="min-w-0 lg:sticky lg:top-4 lg:self-start">
            <QueuePanel
              className="lg:max-h-[calc(100dvh-2rem)] lg:overflow-hidden"
              songs={room.queue}
              onReorder={
                controlCredentials
                  ? (songId, targetIndex) =>
                      runQueueAction(() =>
                        roomApi.reorderSong(
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
                        roomApi.removeSong(
                          code,
                          songActionCredentials,
                          songId,
                        ),
                      )
                  : undefined
              }
              canRemove={(song) => canControlSong(
                song,
                participant?.id,
                isController,
                serverNow,
              )}
            />
          </div>
        </div>
        {participant && (
          <ChatPanel
            roomCode={code}
            messages={chatMessages}
            currentParticipantId={participant.id}
            onSend={sendChatMessage}
          />
        )}
      </section>

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
    </main>
  )
}
