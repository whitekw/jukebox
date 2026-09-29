import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { WifiOff } from 'lucide-react'
import { roomApi } from '../api'
import { Brand } from '../../../shared/ui/Brand'
import { AccountMenu } from '../../auth/components/AccountMenu'
import { useAuth } from '../../auth/context'
import { YouTubePlayer } from '../playback/YouTubePlayer'
import { clampVolume, readPlayerAudioSettings, type PlayerAudioSettings } from '../playback/playerAudioSettings'
import { getErrorMessage, useI18n } from '../../../shared/i18n/i18n-context'
import {
  buttonStyles,
  cn,
  noticeStyles,
  pageMessageStyles,
} from '../../../shared/styles'
import { useRoomState } from '../hooks/useRoomState'
import { NowPlaying } from '../components/NowPlaying'
import { ChatPanel } from '../chat/ChatPanel'
import { ParticipantsMenu } from '../components/ParticipantsMenu'
import { QueuePanel } from '../components/QueuePanel'
import { SearchPanel } from '../components/SearchPanel'
import { RoomPlaybackBar } from '../components/RoomPlaybackBar'
import { CollectionsRail } from '../components/CollectionsRail'
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
  const [localPlaybackPosition, setLocalPlaybackPosition] = useState<{
    songId: string
    positionSeconds: number
  } | null>(null)
  const [audioSettings, setAudioSettings] = useState<PlayerAudioSettings | null>(null)
  const [chatTriggerContainer, setChatTriggerContainer] = useState<HTMLDivElement | null>(null)
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

  const canPlayLocally = isHost || (Boolean(participant) && room.playbackMode === 'all_devices')
  const currentAudioSettings = audioSettings ?? readPlayerAudioSettings(
    room.playbackMode === 'host_only' ? room.hostVolume : 100,
  )
  const playbackStatus = !room.currentSong
    ? 'waiting'
    : room.playbackPaused || (room.playbackMode === 'host_only' && room.playbackBlocked)
      ? 'paused'
      : room.playbackPending
        ? 'waiting'
        : 'playing'
  const playbackStatusLabel = playbackStatus === 'playing'
    ? t('status.nowPlaying')
    : playbackStatus === 'paused'
      ? t('status.paused')
      : t('status.waiting')
  const playbackSynchronization = {
    positionSeconds: room.playbackPositionSeconds,
    anchorAt: room.playbackAnchorAt,
    revision: room.playbackRevision,
    serverTimeOffsetMs,
    pending: room.playbackPending,
  }

  return (
    <main className="flex h-dvh min-h-0 flex-col overflow-hidden bg-canvas bg-[radial-gradient(circle_at_15%_20%,rgba(96,72,163,.17),transparent_30%)]">
      <header className="relative z-[60] flex w-full shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-line px-4 py-3 md:py-4">
        <div className="flex min-w-0 items-center gap-5">
          <Brand className="gap-2 text-base tracking-[0.14em] max-[380px]:[&>span]:hidden md:gap-3 md:text-lg md:tracking-[0.18em]" />
          <div className="flex min-w-0 items-center gap-2 border-l border-line pl-3 font-mono text-xs tracking-[0.08em] text-muted sm:pl-5">
            <span
              className={cn(
                'size-[7px] shrink-0 rounded-full',
                playbackStatus === 'playing' && 'bg-lime shadow-[0_0_0_4px_rgba(215,255,100,.08),0_0_12px_rgba(215,255,100,.45)]',
                playbackStatus === 'paused' && 'bg-yellow-400 shadow-[0_0_0_4px_rgba(250,204,21,.08),0_0_12px_rgba(250,204,21,.35)]',
                playbackStatus === 'waiting' && 'bg-dim',
              )}
              role="img"
              aria-label={playbackStatusLabel}
              title={playbackStatusLabel}
            />
            <span className="max-w-[min(36vw,380px)] truncate text-ink" title={room.title}>{room.title}</span>
            <span className="hidden shrink-0 sm:inline">· {code}</span>
          </div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {!connected && (
            <span
              role="status"
              className="flex items-center gap-2 text-xs text-yellow-400"
              title={t('room.connecting')}
            >
              <WifiOff size={16} aria-hidden="true" className="shrink-0" />
              <span className="sr-only sm:not-sr-only">{t('room.connecting')}</span>
            </span>
          )}
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

      <section className={cn(
        'grid min-h-0 w-full flex-1 grid-cols-1 gap-3 overflow-y-auto overscroll-contain p-4 lg:gap-0 lg:overflow-hidden lg:p-0',
        'lg:grid-cols-[72px_minmax(0,1fr)_minmax(300px,360px)] 2xl:grid-cols-[72px_minmax(0,1fr)_400px]',
      )}>
          <CollectionsRail chatTriggerRef={participant ? setChatTriggerContainer : undefined} />
          <div className={cn(
            'min-w-0 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:px-4 lg:pt-4 lg:[scrollbar-width:none] lg:[&::-webkit-scrollbar]:hidden',
            participant && 'flex flex-col gap-3 lg:overscroll-contain',
          )}>
            <div className="min-h-[300px] lg:min-h-0 lg:shrink-0">
            <NowPlaying
              song={room.currentSong}
              paused={room.playbackPaused}
              blocked={room.playbackMode === 'host_only' && room.playbackBlocked}
              player={
                canPlayLocally && room.currentSong ? (
                  <YouTubePlayer
                    videoId={room.currentSong.videoId}
                    volume={room.playbackMode === 'host_only' ? room.hostVolume : 100}
                    requestedAudioSettings={audioSettings ?? undefined}
                    onAudioSettingsChange={(settings) => setAudioSettings((previous) =>
                      previous?.volume === settings.volume && previous.muted === settings.muted
                        ? previous
                        : settings,
                    )}
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
                    onPositionChange={(videoId, positionSeconds) => {
                      const songId = room.currentSong?.id
                      if (!songId || videoId !== room.currentSong?.videoId) return
                      setLocalPlaybackPosition((previous) =>
                        previous?.songId === songId &&
                        Math.abs(previous.positionSeconds - positionSeconds) < 0.2
                          ? previous
                          : { songId, positionSeconds },
                      )
                    }}
                    onEnded={
                      isHost && room.playbackMode === 'host_only'
                        ? () =>
                            runQueueAction(() =>
                              roomApi.advance(code, hostToken),
                            )
                        : undefined
                    }
                    synchronization={room.playbackMode === 'all_devices' ||
                      (isHost && resumeClaimedPlayback)
                        ? playbackSynchronization
                        : undefined}
                  />
                ) : undefined
              }
              onClaimPlaybackHost={
                isOwner && !isHost && room.playbackMode === 'host_only'
                  ? () => void claimPlaybackHost()
                  : undefined
              }
              claimingPlaybackHost={claimingHost}
            />
            </div>
            {participant && (
              <SearchPanel className="min-h-[250px] lg:grow lg:shrink-0" onAddSong={addSong} />
            )}
          </div>
            <QueuePanel
              className="min-h-[280px] lg:h-full lg:min-h-0 lg:rounded-none lg:border-y-0 lg:border-r-0 lg:bg-panel"
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
      </section>

      <RoomPlaybackBar
        song={room.currentSong}
        paused={room.playbackPaused}
        blocked={room.playbackMode === 'host_only' && room.playbackBlocked}
        synchronization={playbackSynchronization}
        localPositionSeconds={canPlayLocally && localPlaybackPosition && localPlaybackPosition.songId === room.currentSong?.id
          ? localPlaybackPosition.positionSeconds
          : undefined}
        audioSettings={canPlayLocally && room.currentSong ? currentAudioSettings : undefined}
        onVolumeChange={(volume) => {
          const nextVolume = clampVolume(volume)
          setAudioSettings({ volume: nextVolume, muted: nextVolume === 0 })
        }}
        onAdvance={
          songActionCredentials && room.currentSong &&
          canControlSong(room.currentSong, participant?.id, isController, serverNow)
            ? () => runQueueAction(() => roomApi.advance(code, songActionCredentials))
            : undefined
        }
        onGlobalPlaybackToggle={
          controlCredentials
            ? () => runQueueAction(() => roomApi.setPlaybackPaused(
                code,
                controlCredentials,
                !room.playbackPaused,
              ))
            : undefined
        }
      />
      {participant && (
        <ChatPanel
          roomCode={code}
          messages={chatMessages}
          currentParticipantId={participant.id}
          triggerContainer={chatTriggerContainer}
          onSend={sendChatMessage}
        />
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
    </main>
  )
}
