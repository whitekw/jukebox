import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, hostTokenKey, participantTokenKey } from '../api'
import { useAuth } from '../auth'
import { EntryLayout } from '../components/EntryLayout'
import { getErrorMessage, useI18n } from '../i18n-context'
import {
  buttonStyles,
  cn,
} from '../styles'
import type { PlaybackMode } from '../types'

type ChoiceCardProps = {
  value: PlaybackMode
  title: string
  description: string
  context: string
  checked: boolean
  recommended?: string
  disabled: boolean
  onChange: () => void
}

function ChoiceCard({ value, title, description, context, checked, recommended, disabled, onChange }: ChoiceCardProps) {
  return (
    <label className={cn(
      'flex min-h-[114px] items-center gap-4 rounded-[18px] border bg-[#15121e] p-4 transition-colors sm:p-5',
      'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-4 has-[:focus-visible]:outline-purple-light',
      disabled ? 'cursor-wait opacity-60' : 'cursor-pointer hover:bg-[#1b1726]',
      checked ? 'border-purple-light shadow-[inset_3px_0_0_#c2afff]' : 'border-line',
    )}>
      <input className="size-[18px] shrink-0 accent-purple-light [color-scheme:dark]" type="radio" name="playback-mode" value={value} checked={checked} disabled={disabled} onChange={onChange} />
      <span className="min-w-0">
        <span className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <strong className="text-base font-bold tracking-[-0.02em]">{title}</strong>
          {recommended && <span className="text-xs text-purple-light">{recommended}</span>}
        </span>
        <span className="block text-[13px] leading-6 text-muted [word-break:keep-all]">{description}</span>
        <span className="block text-xs leading-6 text-muted">{context}</span>
      </span>
    </label>
  )
}

export function CreateRoomPage() {
  const { t } = useI18n()
  const { enabled, loading: authLoading, user, loginUrl } = useAuth()
  const navigate = useNavigate()
  const [playbackMode, setPlaybackMode] =
    useState<PlaybackMode>('all_devices')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  async function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (creating) return
    setCreating(true)
    setError('')
    try {
      const created = await api.createRoom(playbackMode)
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

  if (authLoading) {
    return (
      <EntryLayout>
        <p className="mx-auto mt-20 text-center text-sm text-muted" role="status">{t('auth.checkingSession')}</p>
      </EntryLayout>
    )
  }

  return (
    <EntryLayout>
      <div className="mx-auto mt-6 max-w-[600px] pb-8 md:mt-9">
        <Link className="inline-flex min-h-11 items-center gap-2 text-sm text-muted transition-colors hover:text-ink" to="/">
          <span aria-hidden="true">←</span>{t('common.home')}
        </Link>
        {!user ? (
          <section className="mt-6 rounded-[18px] border border-line bg-[#15121e] p-6 sm:p-8">
            <h1 className="text-2xl font-bold tracking-[-0.03em] [word-break:keep-all]">{t('createRoom.loginRequiredTitle')}</h1>
            <p className="mt-3 mb-6 text-sm leading-7 text-muted [word-break:keep-all]">
              {enabled ? t('createRoom.loginRequiredDescription') : t('createRoom.authUnavailable')}
            </p>
            {enabled && (
              <a className={buttonStyles({ intent: 'primary', size: 'lg', fullWidth: true })} href={loginUrl('/rooms/new')}>
                {t('auth.loginWithDiscord')}
              </a>
            )}
            <p className="mt-4 text-xs leading-6 text-muted">{t('createRoom.guestNote')}</p>
          </section>
        ) : (
          <>
            <header className="mt-5 mb-6">
              <h1 className="text-[28px] leading-tight font-bold tracking-[-0.04em] [word-break:keep-all] sm:text-[34px]">{t('createRoom.choiceTitle')}</h1>
              <p className="mt-3 text-sm leading-6 text-muted">{t('createRoom.inviteDescription')}</p>
            </header>
            <form className="grid gap-5" onSubmit={createRoom} aria-busy={creating}>
              <fieldset className="grid gap-3" disabled={creating}>
                <legend className="sr-only">{t('home.playbackModeLabel')}</legend>
                <ChoiceCard value="all_devices" title={t('createRoom.togetherTitle')} description={t('createRoom.togetherDescription')} context={t('createRoom.togetherContext')} recommended={t('createRoom.recommended')} checked={playbackMode === 'all_devices'} disabled={creating} onChange={() => setPlaybackMode('all_devices')} />
                <ChoiceCard value="host_only" title={t('createRoom.speakerTitle')} description={t('createRoom.speakerDescription')} context={t('createRoom.speakerContext')} checked={playbackMode === 'host_only'} disabled={creating} onChange={() => setPlaybackMode('host_only')} />
              </fieldset>
              {error && <p className="rounded-xl border border-danger/30 bg-danger/[0.08] px-4 py-3 text-sm leading-6 text-[#ffd4db]" role="alert">{error}</p>}
              <div>
                <button className={cn(buttonStyles({ intent: 'primary', size: 'lg', fullWidth: true }), 'gap-4 text-sm')} disabled={creating} type="submit">
                  {creating ? t('home.creating') : playbackMode === 'all_devices' ? t('createRoom.createTogether') : t('createRoom.createSpeaker')}
                  <span aria-hidden="true">→</span>
                </button>
                <p className="mt-3 text-center text-xs leading-6 text-muted">{t('createRoom.guestNote')}</p>
              </div>
            </form>
          </>
        )}
      </div>
    </EntryLayout>
  )
}
