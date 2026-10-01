import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { History, WifiOff } from 'lucide-react'
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
import { SongRequestDialog } from '../components/SongRequestDialog'
import { RoomPlaybackBar } from '../components/RoomPlaybackBar'
import { CollectionsRail } from '../components/CollectionsRail'
import { InviteRoomButton } from '../components/InviteRoomButton'
import { RoomJoinPreview } from '../components/RoomJoinPreview'
import { RoomSettingsButton } from '../components/RoomSettingsButton'
import { PlaylistTracksPanel } from '../../library/PlaylistTracksPanel'
import type { Playlist } from '../../library/api'
import { canControlSong, getRoomPermissions } from '../roomPermissions'
import { useRoomSession } from '../hooks/useRoomSession'
import { clearStoredRoomCredentials, normalizeRoomCode } from '../roomCredentials'
import { useRoomActions } from '../hooks/useRoomActions'
import { useSongVote } from '../hooks/useSongVote'

const RoomStatsPanel = lazy(() => import('../components/RoomStatsPanel'))

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
  const [requestSongOpen, setRequestSongOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [selectedPlaylist, setSelectedPlaylist] = useState<{ userId: string; playlist: Playlist } | null>(null)
  const [libraryRevision, setLibraryRevision] = useState(0)
  const [songControlTick, setSongControlTick] = useState(0)
  const [localPlaybackPosition, setLocalPlaybackPosition] = useState<{
    songId: string
    positionSeconds: number
  } | null>(null)
  const [audioSettings, setAudioSettings] = useState<PlayerAudioSettings | null>(null)
  const lastAudibleVolume = useRef(50)
  const [chatTriggerContainer, setChatTriggerContainer] = useState<HTMLDivElement | null>(null)
  const wasAuthenticated = useRef(false)
  const joinUrl = useMemo(() => `${window.location.origin}/room/${code}`, [code])
  const activePlaylist = selectedPlaylist && user?.id === selectedPlaylist.userId ? selectedPlaylist.playlist : null
  const closePlaylist = useCallback(() => setSelectedPlaylist(null), [])
  const closeStats = useCallback(() => setStatsOpen(false), [])
  function openSongRequest() {
    setSelectedPlaylist(null)
    setStatsOpen(false)
    setRequestSongOpen(true)
  }
  function openPlaylist(playlist: Playlist) {
    if (!user) return
    setRequestSongOpen(false)
    setStatsOpen(false)
    setSelectedPlaylist({ userId: user.id, playlist })
  }
  function toggleStats() {
    setRequestSongOpen(false)
    setSelectedPlaylist(null)
    setStatsOpen((current) => !current)
  }
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
  const songVote = useSongVote({
    code,
    songId: room?.currentSong?.id,
    participantId: participant?.id,
    participantToken,
    setRoom,
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
      <header data-desktop-titlebar className="relative z-[60] flex w-full shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-line px-4 py-3 md:py-4">
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
        <div data-desktop-no-drag className="ml-auto flex shrink-0 items-center gap-2">
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
        'grid min-h-0 w-full flex-1 auto-rows-max grid-cols-1 gap-3 overflow-y-auto overscroll-contain p-4 sm:auto-rows-auto sm:gap-0 sm:overflow-hidden sm:p-0',
        'sm:grid-cols-[72px_minmax(0,1fr)_72px] room:grid-cols-[72px_minmax(0,1fr)_minmax(300px,360px)] 2xl:grid-cols-[72px_minmax(0,1fr)_400px]',
      )}>
          <CollectionsRail chatTriggerRef={participant ? setChatTriggerContainer : undefined}
            statsOpen={statsOpen} onToggleStats={participant ? toggleStats : undefined}
            libraryRevision={libraryRevision} selectedPlaylistId={activePlaylist?.id ?? null} onSelectPlaylist={openPlaylist} />
          <div className={cn(
            'relative min-w-0 sm:h-full sm:min-h-0 sm:overflow-y-auto sm:overscroll-contain sm:[scrollbar-width:none] sm:[&::-webkit-scrollbar]:hidden',
            statsOpen && 'min-h-[max(420px,calc(100dvh-220px))]',
          )}>
            <div inert={requestSongOpen || Boolean(activePlaylist) || statsOpen} aria-hidden={requestSongOpen || Boolean(activePlaylist) || statsOpen} className="flex min-h-full flex-col items-center justify-center px-0 py-6 sm:px-6">
            <NowPlaying
              onRequestSong={participant ? openSongRequest : undefined}
              song={room.currentSong}
              player={
                canPlayLocally && room.currentSong ? (
                  <YouTubePlayer
                    videoId={room.currentSong.videoId}
                    volume={room.playbackMode === 'host_only' ? room.hostVolume : 100}
                    requestedAudioSettings={audioSettings ?? undefined}
                    onAudioSettingsChange={(settings) => {
                      if (settings.volume > 0) lastAudibleVolume.current = settings.volume
                      setAudioSettings((previous) =>
                        previous?.volume === settings.volume && previous.muted === settings.muted
                          ? previous
                          : settings,
                      )
                    }}
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
              <SongRequestDialog
                open={requestSongOpen}
                onClose={() => setRequestSongOpen(false)}
                onAddSong={addSong}
                message={message}
                error={error || roomError}
              />
            )}
            {activePlaylist && (
              <PlaylistTracksPanel
                key={activePlaylist.id}
                playlist={activePlaylist}
                revision={libraryRevision}
                onClose={closePlaylist}
                onAddSong={participant ? addSong : undefined}
                onLibraryChange={() => setLibraryRevision((revision) => revision + 1)}
                onPlaylistRenamed={(name, updatedAt) => {
                  setSelectedPlaylist((current) => current && current.playlist.id === activePlaylist.id
                    ? { ...current, playlist: { ...current.playlist, name, updatedAt } }
                    : current)
                  setLibraryRevision((revision) => revision + 1)
                }}
                onPlaylistDeleted={() => {
                  setSelectedPlaylist(null)
                  setLibraryRevision((revision) => revision + 1)
                }}
                message={message}
                roomError={error || roomError}
              />
            )}
            {statsOpen && participant && <Suspense fallback={<div className="absolute inset-0 z-20 bg-canvas p-6 text-sm text-muted" role="status">{t('library.loading')}</div>}>
              <RoomStatsPanel code={code} participantToken={participantToken}
                revision={`${room.currentSong?.id ?? ''}:${room.currentSong?.voteRevision ?? 0}:${room.playbackRevision}`}
                onClose={closeStats} onAddSong={addSong}
                onLibraryChange={() => setLibraryRevision((revision) => revision + 1)}
                libraryRevision={libraryRevision} message={message} roomError={error || roomError} />
            </Suspense>}
          </div>
            <QueuePanel
              className="min-h-[280px] sm:h-full sm:min-h-0 sm:rounded-none sm:border-y-0 sm:border-r-0 sm:bg-panel"
              songs={room.queue}
              onLibraryChange={() => setLibraryRevision((revision) => revision + 1)}
              libraryRevision={libraryRevision}
              onRequestSong={participant ? openSongRequest : undefined}
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
        vote={{
          myVote: songVote.myVote,
          ready: songVote.ready,
          isOwnRequest: Boolean(room.currentSong && participant &&
            room.currentSong.addedById === participant.id) || songVote.isOwnRequest,
          voting: songVote.voting,
          error: songVote.error,
          onVote: (choice) => { void songVote.vote(choice) },
        }}
        libraryRevision={libraryRevision}
        onLibraryChange={() => setLibraryRevision((revision) => revision + 1)}
        paused={room.playbackPaused}
        blocked={room.playbackMode === 'host_only' && room.playbackBlocked}
        synchronization={playbackSynchronization}
        localPositionSeconds={canPlayLocally && localPlaybackPosition && localPlaybackPosition.songId === room.currentSong?.id
          ? localPlaybackPosition.positionSeconds
          : undefined}
        audioSettings={canPlayLocally && room.currentSong ? currentAudioSettings : undefined}
        onVolumeChange={(volume) => {
          const nextVolume = clampVolume(volume)
          if (nextVolume > 0) lastAudibleVolume.current = nextVolume
          setAudioSettings({ volume: nextVolume, muted: nextVolume === 0 })
        }}
        onMuteToggle={() => setAudioSettings((previous) => {
          const current = previous ?? currentAudioSettings
          if (current.muted || current.volume === 0) {
            return { volume: current.volume || lastAudibleVolume.current, muted: false }
          }
          return { ...current, muted: true }
        })}
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
      {participant && <button type="button"
        className={cn(
          'fixed right-4 bottom-[196px] z-[70] grid size-14 place-items-center rounded-[4px] border border-purple-light/30 text-purple-light shadow-[0_12px_38px_rgba(0,0,0,.48)] backdrop-blur-xl transition-colors hover:border-purple-light/45 hover:bg-purple/35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-light sm:hidden',
          statsOpen ? 'bg-purple/55 text-white' : 'bg-purple/25',
        )}
        aria-label={t('stats.open')} title={t('stats.open')} aria-pressed={statsOpen}
        onClick={toggleStats}><History size={25} aria-hidden="true" /></button>}
      {participant && (
        <ChatPanel
          roomCode={code}
          messages={chatMessages}
          participants={room.participants}
          currentParticipantId={participant.id}
          triggerContainer={chatTriggerContainer}
          onSend={sendChatMessage}
        />
      )}

      {(error || roomError) && !requestSongOpen && !activePlaylist && (
        <div className={noticeStyles({ tone: 'error' })}>
          {error || roomError}
        </div>
      )}
      {message && !requestSongOpen && !activePlaylist && (
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
