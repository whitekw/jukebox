import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ApiError,
  api,
  clearStoredRoomCredentials,
  getStoredRoomCredentials,
  hostTokenKey,
  normalizeRoomCode,
} from '../api'
import { Brand } from '../components/Brand'
import { MusicIcon, UsersIcon } from '../components/Icons'
import { LocaleSwitcher } from '../components/LocaleSwitcher'
import { getErrorMessage, useI18n } from '../i18n-context'
import type { PlaybackMode, RoomSession } from '../types'
import {
  buttonStyles,
  cardIconStyles,
  cn,
  formControlStyles,
  noticeStyles,
  sectionKickerStyles,
} from '../styles'

export function HomePage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [roomCode, setRoomCode] = useState('')
  const [playbackMode, setPlaybackMode] =
    useState<PlaybackMode>('host_only')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [roomSessions, setRoomSessions] = useState<RoomSession[]>([])

  useEffect(() => {
    let active = true
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
          .sort((left, right) => right.room.expiresAt - left.room.expiresAt),
      )
    })
    return () => {
      active = false
    }
  }, [])

  async function createRoom(event: FormEvent) {
    event.preventDefault()
    setCreating(true)
    setError('')
    try {
      const created = await api.createRoom(playbackMode)
      localStorage.setItem(hostTokenKey(created.code), created.hostToken)
      navigate(`/room/${created.code}`)
    } catch (requestError) {
      setError(getErrorMessage(requestError, t))
    } finally {
      setCreating(false)
    }
  }

  function joinRoom(event: FormEvent) {
    event.preventDefault()
    const code = normalizeRoomCode(roomCode)
    if (code) navigate(`/room/${code}`)
  }

  return (
    <main
      className={cn(
        'relative min-h-screen overflow-hidden bg-canvas px-4 py-[22px]',
        'bg-[radial-gradient(circle_at_73%_17%,rgba(136,91,255,.19),transparent_28%),radial-gradient(circle_at_19%_80%,rgba(215,255,100,.055),transparent_25%)]',
        'before:pointer-events-none before:absolute before:inset-0 before:bg-[linear-gradient(rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.04)_1px,transparent_1px)]',
        'before:bg-[size:68px_68px] before:opacity-[.18] before:[mask-image:linear-gradient(to_bottom,black,transparent_85%)]',
        'md:px-[clamp(22px,6vw,92px)] md:py-[30px]',
      )}
    >
      <nav className="relative z-[1] mx-auto flex max-w-[1180px] items-center justify-between">
        <Brand />
        <div className="flex items-center gap-3">
          <LocaleSwitcher />
        </div>
      </nav>

      <section
        className={cn(
          'relative z-[1] mx-auto mt-12 grid max-w-[920px] grid-cols-1 gap-[18px] md:mt-16 md:grid-cols-2',
          roomSessions.length > 0 ? 'mb-8' : 'mb-[72px]',
        )}
      >
        <form
          className={cn(
            'relative flex min-h-[460px] flex-col rounded-[18px] border border-purple/30',
            'bg-[#12101a]/90 p-6 shadow-[0_24px_70px_rgba(0,0,0,.25)] backdrop-blur-2xl',
            'motion-safe:animate-rise md:min-h-[500px] md:p-[30px]',
          )}
          onSubmit={createRoom}
        >
          <div className={cardIconStyles()}><MusicIcon size={26} /></div>
          <span className={cn(sectionKickerStyles, 'mb-[7px] text-purple-light')}>
            FOR HOST
          </span>
          <h2 className="mb-2 text-[27px] tracking-[-0.03em]">
            {t('home.createTitle')}
          </h2>
          <p className="mb-5 text-sm text-muted">{t('home.createDescription')}</p>
          <fieldset className="mt-auto mb-3 grid gap-2 border-0 p-0">
            <legend className="mb-2 text-[11px] font-extrabold tracking-[0.12em] text-dim uppercase">
              {t('home.playbackModeLabel')}
            </legend>
            {([
              {
                value: 'host_only',
                title: t('home.playbackModeHostOnly'),
                description: t('home.playbackModeHostOnlyDescription'),
              },
              {
                value: 'all_devices',
                title: t('home.playbackModeAllDevices'),
                description: t('home.playbackModeAllDevicesDescription'),
              },
            ] satisfies Array<{
              value: PlaybackMode
              title: string
              description: string
            }>).map((option) => (
              <label
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors',
                  playbackMode === option.value
                    ? 'border-purple/60 bg-purple/[0.10]'
                    : 'border-line bg-white/[0.025] hover:bg-white/[0.045]',
                )}
                key={option.value}
              >
                <input
                  className="mt-1 accent-purple"
                  type="radio"
                  name="playback-mode"
                  value={option.value}
                  checked={playbackMode === option.value}
                  onChange={() => setPlaybackMode(option.value)}
                />
                <span className="min-w-0">
                  <strong className="block text-sm text-ink">
                    {option.title}
                  </strong>
                  <small className="mt-0.5 block leading-4 text-dim">
                    {option.description}
                  </small>
                </span>
              </label>
            ))}
          </fieldset>
          <button
            className={buttonStyles({
              intent: 'primary',
              size: 'lg',
              spread: true,
              fullWidth: true,
            })}
            disabled={creating}
            type="submit"
          >
            {creating ? t('home.creating') : t('home.create')} <span>→</span>
          </button>
        </form>

        <form
          className={cn(
            'relative flex min-h-[350px] flex-col rounded-[18px] border border-line',
            'bg-[#12101a]/90 p-6 shadow-[0_24px_70px_rgba(0,0,0,.25)] backdrop-blur-2xl',
            'motion-safe:animate-rise motion-safe:[animation-delay:.08s] md:min-h-[380px] md:p-[30px]',
          )}
          onSubmit={joinRoom}
        >
          <div className={cardIconStyles({ tone: 'lime' })}><UsersIcon size={26} /></div>
          <span className={cn(sectionKickerStyles, 'mb-[7px]')}>FOR GUEST</span>
          <h2 className="mb-2 text-[27px] tracking-[-0.03em]">
            {t('home.joinTitle')}
          </h2>
          <p className="mb-7 text-sm text-muted">{t('home.joinDescription')}</p>
          <label
            className="mt-auto mb-2 text-[11px] font-extrabold tracking-[0.12em] text-dim uppercase"
            htmlFor="room-code"
          >
            {t('home.roomCodeLabel')}
          </label>
          <input
            id="room-code"
            className={cn(formControlStyles({ size: 'code' }), 'mb-3')}
            value={roomCode}
            onChange={(event) => setRoomCode(normalizeRoomCode(event.target.value).slice(0, 6))}
            placeholder="ABC234"
            minLength={6}
            maxLength={6}
            autoComplete="off"
            required
          />
          <button
            className={buttonStyles({
              intent: 'secondary',
              size: 'lg',
              spread: true,
              fullWidth: true,
            })}
            type="submit"
          >
            {t('home.join')} <span>→</span>
          </button>
        </form>
      </section>

      {roomSessions.length > 0 && (
        <section className="relative z-[1] mx-auto mb-[72px] max-w-[920px]">
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <span className={sectionKickerStyles}>
                {t('home.activeRoomsTitle')}
              </span>
              <p className="mt-1 text-xs text-dim">
                {t('home.activeRoomsDescription')}
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {roomSessions.map((session) => (
              <Link
                className={cn(
                  'group flex min-w-0 items-center gap-3 rounded-2xl border border-line bg-[#12101a]/90 p-3.5',
                  'shadow-[0_16px_45px_rgba(0,0,0,.18)] transition-colors hover:border-purple/50 hover:bg-purple/[0.08]',
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
                    <span className="truncate rounded-full border border-line px-2 py-0.5 text-[10px] text-dim">
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
                  <p className="mt-1 text-[10px] text-dim">
                    {t('home.activeRoomStats', {
                      participants: session.room.participants.length,
                      songs: session.room.queue.length,
                    })}
                  </p>
                </div>
                <span
                  className="shrink-0 text-lg text-dim transition-transform group-hover:translate-x-0.5 group-hover:text-lime"
                  aria-label={t('home.rejoinRoom')}
                >
                  →
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {error && <div className={noticeStyles({ tone: 'error' })}>{error}</div>}

      <footer className="relative z-[1] mx-auto flex max-w-[1180px] flex-col gap-4 text-[10px] tracking-[0.16em] text-[#56515e] md:flex-row md:justify-between">
        <span>SELF-HOSTED · OPEN WEB</span>
        <span>Powered by YouTube</span>
      </footer>
    </main>
  )
}
