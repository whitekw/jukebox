import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, hostTokenKey, participantTokenKey } from '../api'
import { useAuth } from '../auth'
import { AccountMenu } from '../components/AccountMenu'
import { Brand } from '../components/Brand'
import { getErrorMessage, useI18n } from '../i18n-context'
import {
  buttonStyles,
  cn,
  formControlStyles,
  sectionKickerStyles,
} from '../styles'
import type { PlaybackMode } from '../types'

type ChoiceCardProps = {
  name: string
  value: string
  title: string
  description: string
  checked: boolean
  marker: string
  onChange: () => void
}

function ChoiceCard({
  name,
  value,
  title,
  description,
  checked,
  marker,
  onChange,
}: ChoiceCardProps) {
  return (
    <label
      className={cn(
        'group relative flex min-h-[112px] cursor-pointer flex-col justify-between overflow-hidden rounded-[20px] border p-4 transition-all duration-200',
        checked
          ? 'border-purple/70 bg-[linear-gradient(145deg,rgba(155,123,255,.18),rgba(155,123,255,.06))] shadow-[inset_0_1px_0_rgba(255,255,255,.06),0_14px_40px_rgba(53,36,95,.16)]'
          : 'border-line bg-white/[0.025] hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.045]',
      )}
    >
      <input
        className="sr-only"
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
      />
      <div className="flex items-start justify-between gap-4">
        <span
          className={cn(
            'font-mono text-[10px] font-black tracking-[0.16em] transition-colors',
            checked ? 'text-purple-light' : 'text-dim',
          )}
        >
          {marker}
        </span>
        <span
          className={cn(
            'grid size-5 shrink-0 place-items-center rounded-full border transition-colors',
            checked
              ? 'border-purple-light bg-purple-light text-[#171020]'
              : 'border-white/20 bg-transparent text-transparent',
          )}
          aria-hidden="true"
        >
          <span className="text-[11px] font-black">✓</span>
        </span>
      </div>
      <div className="mt-4">
        <strong className="block text-[15px] tracking-[-0.02em] text-ink">
          {title}
        </strong>
        <small className="mt-1.5 block text-[11px] leading-[1.55] text-dim">
          {description}
        </small>
      </div>
    </label>
  )
}

function ProfileAvatar({
  avatarUrl,
  nickname,
}: {
  avatarUrl?: string | null
  nickname: string
}) {
  return (
    <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-full border border-purple/50 bg-[linear-gradient(145deg,rgba(155,123,255,.25),rgba(215,255,100,.08))] font-black text-purple-light shadow-[0_0_0_4px_rgba(155,123,255,.08)]">
      {avatarUrl ? (
        <img className="size-full object-cover" src={avatarUrl} alt="" />
      ) : (
        nickname.trim().slice(0, 1).toUpperCase() || '?'
      )}
    </span>
  )
}

function StepHeading({
  number,
  title,
  description,
}: {
  number: string
  title: string
  description: string
}) {
  return (
    <div className="mb-5 flex items-start gap-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-purple/30 bg-purple/[0.09] font-mono text-[10px] font-black text-purple-light">
        {number}
      </span>
      <div>
        <h2 className="text-lg tracking-[-0.03em]">{title}</h2>
        <p className="mt-1 text-xs leading-5 text-dim">{description}</p>
      </div>
    </div>
  )
}

export function CreateRoomPage() {
  const { t } = useI18n()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [customNickname, setCustomNickname] = useState('')
  const [playbackMode, setPlaybackMode] =
    useState<PlaybackMode>('host_only')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const accountNickname = user?.displayName.slice(0, 20) ?? ''
  const nickname = user ? accountNickname : customNickname

  async function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCreating(true)
    setError('')
    try {
      const created = await api.createRoom(playbackMode, nickname)
      localStorage.setItem(hostTokenKey(created.code), created.hostToken)
      localStorage.setItem(
        participantTokenKey(created.code),
        created.participantToken,
      )
      navigate(`/room/${created.code}`)
    } catch (requestError) {
      setError(getErrorMessage(requestError, t))
    } finally {
      setCreating(false)
    }
  }

  return (
    <main
      className={cn(
        'relative min-h-screen overflow-hidden bg-canvas px-4 py-[22px]',
        'bg-[radial-gradient(circle_at_15%_10%,rgba(102,71,190,.14),transparent_24%),radial-gradient(circle_at_88%_8%,rgba(155,123,255,.07),transparent_22%)]',
        'before:pointer-events-none before:absolute before:inset-0 before:bg-[linear-gradient(rgba(255,255,255,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.03)_1px,transparent_1px)]',
        'before:bg-[size:64px_64px] before:opacity-20 before:[mask-image:linear-gradient(to_bottom,black,transparent_88%)]',
        'md:px-[clamp(22px,5vw,72px)] md:py-[30px]',
      )}
    >
      <nav className="relative z-[3] mx-auto flex max-w-[1040px] items-center justify-between">
        <Brand />
        <AccountMenu />
      </nav>

      <div className="relative z-[1] mx-auto mt-9 max-w-[1040px] pb-10 md:mt-12">
        <Link
          className="inline-flex items-center gap-2 text-xs font-extrabold tracking-[0.08em] text-dim transition-colors hover:text-ink"
          to="/"
        >
          <span className="text-base" aria-hidden="true">←</span>
          {t('common.home')}
        </Link>

        <header className="mt-7 mb-8 border-b border-white/[0.08] pb-8 md:flex md:items-end md:justify-between md:gap-10">
          <div>
            <span className={cn(sectionKickerStyles, 'text-purple-light')}>
              CREATE ROOM
            </span>
            <h1 className="mt-3 text-[clamp(36px,5vw,58px)] leading-none tracking-[-0.06em]">
              {t('home.createTitle')}
            </h1>
          </div>
          <p className="mt-4 max-w-[420px] text-[13px] leading-6 text-muted md:mt-0 md:text-right">
            {t('createRoom.description')}
          </p>
        </header>

        <form className="grid gap-4" onSubmit={createRoom}>
          <section className="rounded-[24px] border border-line bg-[#121017]/90 p-5 shadow-[0_20px_60px_rgba(0,0,0,.2)] backdrop-blur-xl md:p-6">
            <StepHeading
              number="01"
              title={t('createRoom.profileTitle')}
              description={
                user
                  ? t('createRoom.accountProfileDescription')
                  : t('createRoom.customProfileDescription')
              }
            />

            {user ? (
              <div className="flex items-center gap-4 rounded-[20px] border border-purple/45 bg-[linear-gradient(145deg,rgba(155,123,255,.14),rgba(155,123,255,.045))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.05)]">
                <ProfileAvatar
                  avatarUrl={user.avatarUrl}
                  nickname={accountNickname}
                />
                <div className="min-w-0 flex-1">
                  <span className="font-mono text-[9px] font-black tracking-[0.16em] text-purple-light">
                    ACCOUNT
                  </span>
                  <strong className="mt-1 block truncate text-[15px] text-ink">
                    {accountNickname}
                  </strong>
                  <span className="mt-0.5 block text-[10px] text-dim">
                    {t('createRoom.accountProfile')}
                  </span>
                </div>
                <span className="hidden rounded-full border border-purple/25 bg-purple/[0.08] px-3 py-1.5 text-[10px] font-bold text-purple-light sm:block">
                  {t('createRoom.accountNicknameLocked')}
                </span>
              </div>
            ) : (
              <div>
                <label
                  className="mb-2 block text-[10px] font-extrabold tracking-[0.12em] text-dim uppercase"
                  htmlFor="creator-nickname"
                >
                  {t('room.nicknameLabel')}
                </label>
                <input
                  className={formControlStyles({ size: 'large' })}
                  id="creator-nickname"
                  value={customNickname}
                  onChange={(event) => setCustomNickname(event.target.value)}
                  placeholder={t('createRoom.nicknamePlaceholder')}
                  minLength={2}
                  maxLength={20}
                  autoComplete="nickname"
                  autoFocus
                  required
                />
              </div>
            )}
          </section>

          <fieldset className="rounded-[24px] border border-line bg-[#121017]/90 p-5 shadow-[0_20px_60px_rgba(0,0,0,.2)] backdrop-blur-xl md:p-6">
            <legend className="sr-only">{t('home.playbackModeLabel')}</legend>
            <StepHeading
              number="02"
              title={t('home.playbackModeLabel')}
              description={t('createRoom.playbackDescription')}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <ChoiceCard
                name="playback-mode"
                value="host_only"
                marker="HOST"
                title={t('home.playbackModeHostOnly')}
                description={t('home.playbackModeHostOnlyDescription')}
                checked={playbackMode === 'host_only'}
                onChange={() => setPlaybackMode('host_only')}
              />
              <ChoiceCard
                name="playback-mode"
                value="all_devices"
                marker="SYNC"
                title={t('home.playbackModeAllDevices')}
                description={t('home.playbackModeAllDevicesDescription')}
                checked={playbackMode === 'all_devices'}
                onChange={() => setPlaybackMode('all_devices')}
              />
            </div>
          </fieldset>

          {error && (
            <p
              className="rounded-2xl border border-danger/30 bg-danger/[0.08] px-4 py-3 text-sm leading-5 text-[#ffd4db]"
              role="alert"
            >
              {error}
            </p>
          )}

          <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Link
              className={cn(
                buttonStyles({ intent: 'outline', size: 'lg' }),
                'sm:min-w-[120px]',
              )}
              to="/"
            >
              {t('common.cancel')}
            </Link>
            <button
              className={cn(
                buttonStyles({ intent: 'primary', size: 'lg', spread: true }),
                'sm:min-w-[210px]',
              )}
              disabled={creating || nickname.trim().length < 2}
              type="submit"
            >
              {creating ? t('home.creating') : t('home.create')}
              <span className="text-lg">→</span>
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}
