import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, hostTokenKey, normalizeRoomCode } from '../api'
import { Brand } from '../components/Brand'
import { MusicIcon, UsersIcon } from '../components/Icons'
import { LocaleSwitcher } from '../components/LocaleSwitcher'
import { getErrorMessage, useI18n } from '../i18n-context'
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
  const [maxSongs, setMaxSongs] = useState(2)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  async function createRoom(event: FormEvent) {
    event.preventDefault()
    setCreating(true)
    setError('')
    try {
      const created = await api.createRoom(maxSongs)
      localStorage.setItem(hostTokenKey(created.code), created.hostToken)
      navigate(`/host/${created.code}`)
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
          <span className="hidden text-xs tracking-[0.08em] text-dim md:inline">
            {t('home.tagline')}
          </span>
          <LocaleSwitcher />
        </div>
      </nav>

      <section className="relative z-[1] mx-auto mt-[68px] mb-9 max-w-[1180px] md:mt-[clamp(72px,10vh,118px)] md:mb-12">
        <div className="flex items-center gap-2.5 text-[11px] font-extrabold tracking-[0.18em] text-lime">
          <span className="h-px w-[26px] bg-lime" /> NO LOGIN · NO APP · JUST MUSIC
        </div>
        <h1 className="my-5 text-[clamp(46px,14.3vw,72px)] leading-[0.97] font-[850] tracking-[-0.065em] md:text-[clamp(48px,7.4vw,98px)]">
          {t('home.heroLineOne')}
          <br />
          <em className="text-purple-light not-italic">
            {t('home.heroEmphasis')}
          </em>
          {t('home.heroLineTwo')}
        </h1>
        <p className="text-[clamp(15px,1.5vw,19px)] leading-[1.7] text-muted">
          {t('home.descriptionOne')}
          <br className="hidden md:block" /> {t('home.descriptionTwo')}
        </p>
      </section>

      <section className="relative z-[1] mx-auto mb-[72px] grid max-w-[920px] grid-cols-1 gap-[18px] md:grid-cols-2">
        <form
          className={cn(
            'relative flex min-h-[350px] flex-col rounded-[18px] border border-purple/30',
            'bg-[#12101a]/90 p-6 shadow-[0_24px_70px_rgba(0,0,0,.25)] backdrop-blur-2xl',
            'motion-safe:animate-rise md:min-h-[380px] md:p-[30px]',
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
          <p className="mb-7 text-sm text-muted">{t('home.createDescription')}</p>
          <label
            className="mt-auto mb-2 text-[11px] font-extrabold tracking-[0.12em] text-dim uppercase"
            htmlFor="max-songs"
          >
            {t('home.maxSongsLabel')}
          </label>
          <select
            className={cn(formControlStyles({ weight: 'bold' }), 'mb-3 h-[46px]')}
            id="max-songs"
            value={maxSongs}
            onChange={(event) => setMaxSongs(Number(event.target.value))}
          >
            {[1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                {t(value === 1 ? 'common.songCountOne' : 'common.songCount', {
                  count: value,
                })}
              </option>
            ))}
          </select>
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

      {error && <div className={noticeStyles({ tone: 'error' })}>{error}</div>}

      <footer className="relative z-[1] mx-auto flex max-w-[1180px] flex-col gap-4 text-[10px] tracking-[0.16em] text-[#56515e] md:flex-row md:justify-between">
        <span>SELF-HOSTED · OPEN WEB</span>
        <span>Powered by YouTube</span>
      </footer>
    </main>
  )
}
