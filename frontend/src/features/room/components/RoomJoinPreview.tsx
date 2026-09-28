import type { FormEvent } from 'react'
import { ArrowRight, Music2 as MusicIcon } from 'lucide-react'
import type { AuthUser } from '../../auth/types'
import { AccountMenu } from '../../auth/components/AccountMenu'
import { useAuth } from '../../auth/context'
import { getErrorMessage, useI18n } from '../../../shared/i18n/i18n-context'
import { Brand } from '../../../shared/ui/Brand'
import {
  buttonStyles,
  cn,
  formControlStyles,
  sectionKickerStyles,
} from '../../../shared/styles'
import type { RoomState } from '../types'

type RoomJoinPreviewProps = {
  room: RoomState
  user: AuthUser | null
  nickname: string
  onNicknameChange: (nickname: string) => void
  onJoin: (event: FormEvent<HTMLFormElement>) => void
  joining: boolean
  joinError: string
  participantError: unknown
  onRetry: () => void
}

export function RoomJoinPreview({
  room,
  user,
  nickname,
  onNicknameChange,
  onJoin,
  joining,
  joinError,
  participantError,
  onRetry,
}: RoomJoinPreviewProps) {
  const { t } = useI18n()
  const { enabled: loginEnabled, loginUrl } = useAuth()
  const onlineCount = room.participants.filter((participant) => participant.online).length
  const song = room.currentSong
  const guestJoinBlocked = !user && !room.allowGuests && !participantError

  return (
    <main className="min-h-screen bg-canvas bg-[radial-gradient(circle_at_30%_50%,rgba(96,72,163,.13),transparent_40%)] px-4">
      <header className="mx-auto flex max-w-[1120px] items-center justify-between py-6">
        <Brand />
        <AccountMenu compact />
      </header>

      <div className="mx-auto grid min-h-[calc(100svh-88px)] max-w-[1120px] items-start py-8 lg:items-center lg:py-12">
        <div className="grid w-full gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)] lg:items-center lg:gap-14">
          <section className="min-w-0">
            <span className={sectionKickerStyles}>ROOM · {room.code}</span>
            <h1 className="mt-4 text-[clamp(34px,4.5vw,56px)] font-black leading-[1.12] tracking-[-0.055em]">
              {room.title}
            </h1>
            <p className="mt-4 max-w-[520px] text-sm leading-6 text-muted sm:text-base">
              {t('room.previewDescription')}
            </p>

            <div className="mt-8 grid grid-cols-[96px_minmax(0,1fr)] items-center gap-4 rounded-2xl border border-line bg-[#18151f] p-3 sm:grid-cols-[136px_minmax(0,1fr)] sm:gap-5 sm:p-4">
              <div className="grid aspect-video place-items-center overflow-hidden rounded-xl border border-line bg-[#211c2a] text-purple-light">
                {song ? (
                  <img className="size-full object-cover" src={song.thumbnailUrl} alt="" />
                ) : (
                  <MusicIcon size={30} />
                )}
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-black tracking-[0.12em] text-purple-light sm:text-xs">
                  {song
                    ? room.playbackPaused ? t('status.paused') : t('status.nowPlaying')
                    : t('status.waiting')}
                </span>
                <h2 className="mt-1.5 line-clamp-2 text-base leading-snug tracking-[-0.025em] sm:text-xl">
                  {song?.title ?? t('room.previewEmpty')}
                </h2>
                {song && <p className="mt-1 truncate text-xs text-muted sm:text-sm">{song.artist}</p>}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-line pt-5 text-sm">
              <div className="flex items-center gap-2.5">
                <span className="size-2 rounded-full bg-lime shadow-[0_0_12px_rgba(215,255,100,.45)]" aria-hidden="true" />
                <span className="text-muted">{t('room.previewOnline')}</span>
                <strong className="text-base text-ink">{onlineCount}</strong>
              </div>
              <div className="flex items-center gap-2.5">
                <MusicIcon size={16} className="text-purple-light" />
                <span className="text-muted">{t('room.previewQueue')}</span>
                <strong className="text-base text-ink">{room.queue.length}</strong>
              </div>
            </div>
          </section>

          <form className="rounded-[22px] border border-purple/25 bg-[#191620] p-6 shadow-[0_24px_80px_rgba(0,0,0,.2)] sm:p-8" onSubmit={onJoin}>
            <span className={sectionKickerStyles}>JOIN THE ROOM</span>
            <h2 className="mt-3 text-[23px] font-bold leading-snug tracking-[-0.035em]">
              {participantError
                ? t('room.participationRestoreFailed')
                : guestJoinBlocked
                ? t('roomSettings.loginRequiredTitle')
                : user ? t('room.previewJoinAs', { nickname: user.displayName }) : t('room.askNickname')}
            </h2>
            {participantError ? (
              <p className="mt-5 text-sm text-danger" role="alert">
                {getErrorMessage(participantError, t)}
              </p>
            ) : guestJoinBlocked ? (
              <p className="mt-5 text-sm leading-6 text-muted">{t('roomSettings.loginRequiredHint')}</p>
            ) : !user ? (
              <div className="mt-7">
                <label className="mb-2 block text-xs font-bold text-muted" htmlFor="nickname">
                  {t('room.nicknameLabel')}
                </label>
                <input
                  className={formControlStyles({ size: 'large' })}
                  id="nickname"
                  value={nickname}
                  onChange={(event) => onNicknameChange(event.target.value)}
                  minLength={1}
                  maxLength={20}
                  autoComplete="nickname"
                  required
                />
              </div>
            ) : null}
            {joinError && (
              <p className="mt-4 text-sm text-danger" role="alert">{joinError}</p>
            )}
            {!guestJoinBlocked && <button
              className={cn(
                buttonStyles({ intent: 'primary', size: 'lg', spread: true, fullWidth: true }),
                'mt-5',
              )}
              type={participantError ? 'button' : 'submit'}
              disabled={joining}
              onClick={participantError ? onRetry : undefined}
            >
              {participantError
                ? t('common.retry')
                : joining ? t('room.previewJoining') : t('room.previewJoinAction')}
              <ArrowRight size={18} aria-hidden="true" />
            </button>}
            {!user && loginEnabled && (
              <p className="mt-4 text-center text-sm">
                <a
                  className={!guestJoinBlocked
                    ? 'text-muted underline decoration-purple/50 underline-offset-4 transition-colors hover:text-purple-light focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-purple-light'
                    : cn(buttonStyles({ intent: 'primary', size: 'lg', fullWidth: true }), 'justify-center')}
                  href={loginUrl(`/room/${room.code}`)}
                >
                  {!guestJoinBlocked ? t('room.previewLoginInstead') : t('auth.loginWithDiscord')}
                </a>
              </p>
            )}
          </form>
        </div>
      </div>
    </main>
  )
}
