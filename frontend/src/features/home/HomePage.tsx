import { useEffect, useState, type FormEvent } from 'react'
import { ArrowRight, Music2 as MusicIcon, UsersRound } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { normalizeRoomCode } from '../room/roomCredentials'
import type { RoomState } from '../room/types'
import { useHomeRooms } from './useHomeRooms'
import { EntryLayout } from '../../shared/ui/EntryLayout'
import { AccountMenu } from '../auth/components/AccountMenu'
import { LoginRequiredDialog } from '../auth/components/LoginRequiredDialog'
import { DesktopInstallLink } from './DesktopInstallLink'
import { useAuth } from '../auth/context'
import { useI18n } from '../../shared/i18n/i18n-context'
import {
  buttonStyles,
  cn,
  formControlStyles,
  noticeStyles,
} from '../../shared/styles'

export function HomePage() {
  const { t } = useI18n()
  const { loading: authLoading, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [roomCode, setRoomCode] = useState('')
  const [notice, setNotice] = useState('')
  const [loginPromptOpen, setLoginPromptOpen] = useState(false)
  const {
    ownedRooms,
    joinedRooms,
    busyRoomCode,
    roomError,
    leaveJoinedRoom,
  } = useHomeRooms(user)

  useEffect(() => {
    const state = location.state as { roomDeleted?: boolean; loggedOut?: boolean; roomDisconnected?: boolean } | null
    if (!state?.roomDeleted && !state?.loggedOut && !state?.roomDisconnected) return
    setNotice(t(state.roomDisconnected ? 'participants.disconnectedNotice'
      : state.loggedOut ? 'auth.loggedOutRoom' : 'home.roomDeleted'))
    navigate('/', { replace: true, state: null })
  }, [location.state, navigate, t])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 3_000)
    return () => window.clearTimeout(timer)
  }, [notice])

  function joinRoom(event: FormEvent) {
    event.preventDefault()
    const code = normalizeRoomCode(roomCode)
    if (code) navigate(`/room/${code}`)
  }

  const hasRooms = ownedRooms.length > 0 || joinedRooms.length > 0

  return (
    <EntryLayout className={cn(!hasRooms && 'flex min-h-dvh flex-col')} headerActions={
      <div className="flex items-center gap-2.5">
        <DesktopInstallLink />
        <AccountMenu />
      </div>
    }>
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
            <button className={cn(buttonStyles({ intent: 'primary', size: 'lg' }), 'gap-6 rounded-md text-sm font-semibold')} type="button" disabled={authLoading} onClick={() => setLoginPromptOpen(true)} aria-haspopup="dialog">
              {t('home.create')} <ArrowRight size={18} aria-hidden="true" />
            </button>
          ) : (
            <Link className={cn(buttonStyles({ intent: 'primary', size: 'lg' }), 'gap-6 rounded-md text-sm font-semibold')} to="/rooms/new">
              {t('home.create')} <ArrowRight size={18} aria-hidden="true" />
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
                    <strong className="mb-1 block truncate text-sm font-semibold text-ink" title={room.title || room.code}>
                      {room.title || room.code}
                    </strong>
                    <p className="truncate text-sm text-muted">
                      {room.currentSong?.title ?? t('home.activeRoomWaiting')}
                    </p>
                    <RoomCardStats room={room} />
                  </div>
                  <ArrowRight
                    size={20}
                    className="w-5 shrink-0 text-dim transition-transform group-hover:translate-x-0.5 group-hover:text-purple-light group-focus-visible:text-purple-light"
                    aria-label={t('home.rejoinRoom')}
                  />
                </Link>
              </article>
            ))}
          </div>
        </section>
      )}

      {roomError && (
        <div className={noticeStyles({ tone: 'error' })}>{roomError}</div>
      )}
      {notice && <div className={noticeStyles()}>{notice}</div>}

      {joinedRooms.length > 0 && (
        <section className="mx-auto mb-8 max-w-[920px] border-t border-line pt-6">
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-base font-bold tracking-[-0.02em]">
                {t('home.joinedRoomsTitle')}
              </h2>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {joinedRooms.map((room) => (
              <article
                className="relative min-w-0 rounded-xl border border-line bg-white/[0.015] transition-colors hover:border-purple/50 hover:bg-purple/[0.08]"
                key={room.code}
              >
                <Link
                  className="group flex min-h-[104px] min-w-0 items-center gap-3 rounded-xl p-3.5 pr-24 focus-visible:outline-2 focus-visible:outline-purple-light"
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
                    <div className="mb-1 flex min-w-0 items-center gap-2">
                      <strong className="truncate text-sm font-semibold text-ink" title={room.title || room.code}>
                        {room.title || room.code}
                      </strong>
                      <span className="truncate rounded-full border border-line px-2 py-0.5 text-xs text-muted">
                        {t('home.memberBadge')}
                      </span>
                    </div>
                    <p className="truncate text-sm text-muted">
                      {room.currentSong?.title ?? t('home.activeRoomWaiting')}
                    </p>
                    <RoomCardStats room={room} />
                  </div>
                </Link>
                <button
                  className="absolute top-1/2 right-3 -translate-y-1/2 rounded-lg border border-line px-2.5 py-1.5 text-xs text-muted hover:border-danger/40 hover:text-danger disabled:opacity-40"
                  type="button"
                  aria-label={`${room.code} · ${t('home.leaveRoom')}`}
                  disabled={Boolean(busyRoomCode)}
                  onClick={() => void leaveJoinedRoom(room)}
                >
                  {t('home.leaveRoom')}
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      <footer className={cn('mx-auto flex w-full max-w-[920px] shrink-0 flex-wrap items-center justify-between gap-x-5 gap-y-2 pb-4 text-xs text-muted', hasRooms ? 'mt-10' : 'mt-auto')}>
        <span>Powered by YouTube</span>
        <Link className="rounded-sm underline-offset-4 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-purple-light" to="/privacy">
          {t('privacy.link')}
        </Link>
      </footer>
      <LoginRequiredDialog open={loginPromptOpen && !user} onClose={() => setLoginPromptOpen(false)} />
    </EntryLayout>
  )
}

function RoomCardStats({ room }: { room: RoomState }) {
  const { t } = useI18n()
  const participants = room.participants.filter((participant) => participant.online).length
  const songs = room.queue.length

  return (
    <div className="mt-1 text-xs text-muted">
      <span className="sr-only">{t('home.activeRoomStats', { participants, songs })}</span>
      <span className="flex items-center gap-3" aria-hidden="true">
        <span className="inline-flex items-center gap-1"><UsersRound size={14} />{participants}</span>
        <span className="inline-flex items-center gap-1"><MusicIcon size={14} />{songs}</span>
      </span>
    </div>
  )
}
