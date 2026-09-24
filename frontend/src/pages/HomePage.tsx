import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  ApiError,
  api,
  clearStoredRoomCredentials,
  getStoredRoomCredentials,
  normalizeRoomCode,
} from '../api'
import { EntryLayout } from '../components/EntryLayout'
import { LoginRequiredDialog } from '../components/LoginRequiredDialog'
import { MusicIcon } from '../components/Icons'
import { RoomCardMenu } from '../components/RoomCardMenu'
import { useAuth } from '../auth'
import { getErrorMessage, useI18n } from '../i18n-context'
import type { RoomSession, RoomState } from '../types'
import {
  buttonStyles,
  cn,
  formControlStyles,
  noticeStyles,
} from '../styles'

export function HomePage() {
  const { t } = useI18n()
  const { loading: authLoading, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [roomCode, setRoomCode] = useState('')
  const [roomSessions, setRoomSessions] = useState<RoomSession[]>([])
  const [ownedRooms, setOwnedRooms] = useState<RoomState[]>([])
  const [deletingRoomCode, setDeletingRoomCode] = useState('')
  const [notice, setNotice] = useState('')
  const [ownedRoomError, setOwnedRoomError] = useState('')
  const [loginPromptOpen, setLoginPromptOpen] = useState(false)

  useEffect(() => {
    const state = location.state as { roomDeleted?: boolean } | null
    if (!state?.roomDeleted) return
    setNotice(t('home.roomDeleted'))
    navigate('/', { replace: true, state: null })
  }, [location.state, navigate, t])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 3_000)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    let active = true
    function loadRoomSessions() {
      const storedRooms = getStoredRoomCredentials()
      void Promise.all(
        storedRooms.map(async ({ code, hostToken, participantToken }) => {
          try {
            return await api.getRoomSession(code, {
              hostToken,
              participantToken,
            })
          } catch (requestError) {
            if (
              requestError instanceof ApiError &&
              [401, 403, 404].includes(requestError.status)
            ) {
              clearStoredRoomCredentials(code)
            }
            return null
          }
        }),
      ).then((sessions) => {
        if (!active) return
        setRoomSessions(
          sessions
            .filter((session): session is RoomSession => session !== null)
            .sort(
              (left, right) =>
                (right.room.expiresAt ?? 0) - (left.room.expiresAt ?? 0),
            ),
        )
      })
    }

    loadRoomSessions()
    const presenceRefreshTimer = window.setTimeout(loadRoomSessions, 6_000)
    return () => {
      active = false
      window.clearTimeout(presenceRefreshTimer)
    }
  }, [])

  useEffect(() => {
    let active = true
    if (!user) {
      setOwnedRooms([])
      return () => {
        active = false
      }
    }
    void api
      .getOwnedRooms()
      .then(({ items }) => {
        if (active) setOwnedRooms(items)
      })
      .catch(() => {
        if (active) setOwnedRooms([])
      })
    return () => {
      active = false
    }
  }, [user])

  function joinRoom(event: FormEvent) {
    event.preventDefault()
    const code = normalizeRoomCode(roomCode)
    if (code) navigate(`/room/${code}`)
  }

  async function deleteOwnedRoom(room: RoomState) {
    if (
      deletingRoomCode ||
      !window.confirm(t('home.deleteRoomConfirm', { code: room.code }))
    ) {
      return
    }
    setDeletingRoomCode(room.code)
    setOwnedRoomError('')
    try {
      await api.deleteRoom(room.code)
      clearStoredRoomCredentials(room.code)
      setOwnedRooms((current) =>
        current.filter((item) => item.code !== room.code),
      )
      setRoomSessions((current) =>
        current.filter((session) => session.room.code !== room.code),
      )
      setNotice(t('home.roomDeleted'))
    } catch (requestError) {
      setOwnedRoomError(getErrorMessage(requestError, t))
    } finally {
      setDeletingRoomCode('')
    }
  }

  const recentRoomSessions = roomSessions.filter(
    (session) =>
      !ownedRooms.some((room) => room.code === session.room.code),
  )
  const hasRooms = ownedRooms.length > 0 || recentRoomSessions.length > 0

  return (
    <EntryLayout className={cn(!hasRooms && 'flex min-h-dvh flex-col')}>
      <section className={cn(
        'mx-auto grid w-full max-w-[920px] items-center gap-8 md:grid-cols-[minmax(0,1.4fr)_minmax(280px,1fr)] md:gap-16',
        hasRooms ? 'mt-10 mb-10 md:mt-20 md:mb-14' : 'flex-1 content-center py-10 md:pt-12 md:pb-24',
      )}>
        <div>
          <h1 className="text-[clamp(32px,4.4vw,48px)] leading-[1.2] font-bold tracking-[-0.045em] [word-break:keep-all]">
            {t('home.headlineFirst')}<br />{t('home.headlineSecond')}
          </h1>
          <p className="mt-5 mb-6 text-sm leading-7 text-muted [word-break:keep-all]">
            {t('home.heroDescription')}
          </p>
          {!user ? (
            <button className={cn(buttonStyles({ intent: 'primary', size: 'lg' }), 'gap-6 text-sm')} type="button" disabled={authLoading} onClick={() => setLoginPromptOpen(true)} aria-haspopup="dialog">
              {t('home.create')} <span aria-hidden="true">→</span>
            </button>
          ) : (
            <Link className={cn(buttonStyles({ intent: 'primary', size: 'lg' }), 'gap-6 text-sm')} to="/rooms/new">
              {t('home.create')} <span aria-hidden="true">→</span>
            </Link>
          )}
        </div>
        <form className="min-w-0 rounded-[18px] border border-line bg-[#15121e] p-6" onSubmit={joinRoom}>
          <h2 className="text-xl font-bold tracking-[-0.03em]">{t('home.invitedTitle')}</h2>
          <p className="mt-2 mb-5 text-[13px] leading-6 text-muted">{t('home.guestHint')}</p>
          <label className="mb-2 block text-xs text-muted" htmlFor="room-code">{t('home.sharedCodeLabel')}</label>
          <input
            id="room-code"
            className={cn(formControlStyles({ size: 'large' }), 'bg-canvas text-base tracking-[0.18em] uppercase placeholder:text-muted/60')}
            value={roomCode}
            onChange={(event) => setRoomCode(normalizeRoomCode(event.target.value).slice(0, 6))}
            placeholder="ABC234"
            minLength={6}
            maxLength={6}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            required
          />
          <button className={cn(buttonStyles({ intent: 'outline', size: 'md', fullWidth: true }), 'mt-3 bg-transparent')} type="submit">
            {t('home.joinRoomAction')}
          </button>
        </form>
      </section>

      {ownedRooms.length > 0 && (
        <section className="mx-auto mb-8 max-w-[920px] border-t border-line pt-6">
          <div className="mb-4">
            <h2 className="text-base font-bold tracking-[-0.02em]">
              {t('home.myRoomsTitle')}
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {ownedRooms.map((room) => (
              <article
                className={cn(
                  'relative min-w-0 rounded-xl border border-line bg-white/[0.015]',
                  'transition-colors hover:border-purple/60 hover:bg-purple/[0.08]',
                )}
                key={room.code}
              >
                <Link
                  className="group flex min-h-[104px] min-w-0 items-center gap-3 rounded-xl p-3.5 focus-visible:outline-2 focus-visible:outline-purple-light"
                  to={`/room/${room.code}`}
                >
                  <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-white/[0.035]">
                    {room.currentSong ? (
                      <img
                        className="size-full object-cover"
                        src={room.currentSong.thumbnailUrl}
                        alt=""
                      />
                    ) : (
                      <MusicIcon className="text-purple-light" size={22} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <strong className="mb-1 block font-mono text-sm tracking-[0.12em] text-ink">
                      {room.code}
                    </strong>
                    <p className="truncate text-sm text-muted">
                      {room.currentSong?.title ?? t('home.activeRoomWaiting')}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {t('home.activeRoomStats', {
                        participants: room.participants.length,
                        songs: room.queue.length,
                      })}
                    </p>
                  </div>
                  <span
                    className="w-5 shrink-0 text-center text-lg text-dim transition-transform group-hover:translate-x-0.5 group-hover:text-purple-light group-focus-visible:text-purple-light"
                    aria-label={t('home.rejoinRoom')}
                  >
                    →
                  </span>
                </Link>
                <RoomCardMenu
                  roomCode={room.code}
                  disabled={Boolean(deletingRoomCode)}
                  onDelete={() => void deleteOwnedRoom(room)}
                />
              </article>
            ))}
          </div>
        </section>
      )}

      {ownedRoomError && (
        <div className={noticeStyles({ tone: 'error' })}>{ownedRoomError}</div>
      )}
      {notice && <div className={noticeStyles()}>{notice}</div>}

      {recentRoomSessions.length > 0 && (
        <section className="mx-auto mb-8 max-w-[920px] border-t border-line pt-6">
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-base font-bold tracking-[-0.02em]">
                {t('home.recentRoomsTitle')}
              </h2>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {recentRoomSessions.map((session) => (
              <Link
                className={cn(
                  'group flex min-w-0 items-center gap-3 rounded-xl border border-line bg-white/[0.015] p-3.5',
                  'transition-colors hover:border-purple/50 hover:bg-purple/[0.08]',
                )}
                key={session.room.code}
                to={`/room/${session.room.code}`}
              >
                <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-white/[0.035]">
                  {session.room.currentSong ? (
                    <img
                      className="size-full object-cover"
                      src={session.room.currentSong.thumbnailUrl}
                      alt=""
                    />
                  ) : (
                    <MusicIcon className="text-purple-light" size={22} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex min-w-0 items-center gap-2">
                    <strong className="font-mono text-sm tracking-[0.12em] text-ink">
                      {session.room.code}
                    </strong>
                    <span className="truncate rounded-full border border-line px-2 py-0.5 text-xs text-muted">
                      {session.isHost
                        ? t('home.activeRoomHost')
                        : t('home.activeRoomParticipant', {
                            nickname: session.participant?.nickname ?? '',
                          })}
                    </span>
                  </div>
                  <p className="truncate text-sm text-muted">
                    {session.room.currentSong?.title ??
                      t('home.activeRoomWaiting')}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {t('home.activeRoomStats', {
                      participants: session.room.participants.length,
                      songs: session.room.queue.length,
                    })}
                  </p>
                </div>
                <span
                  className="shrink-0 text-lg text-dim transition-transform group-hover:translate-x-0.5 group-hover:text-purple-light"
                  aria-label={t('home.rejoinRoom')}
                >
                  →
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <footer className={cn('mx-auto w-full max-w-[920px] shrink-0 pb-4 text-xs text-muted', hasRooms ? 'mt-10' : 'mt-auto')}>
        Powered by YouTube
      </footer>
      <LoginRequiredDialog open={loginPromptOpen && !user} onClose={() => setLoginPromptOpen(false)} />
    </EntryLayout>
  )
}
