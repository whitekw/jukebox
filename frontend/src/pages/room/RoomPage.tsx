import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  api,
  normalizeRoomCode,
  participantTokenKey,
} from '../../api'
import { Brand } from '../../components/Brand'
import { MusicIcon } from '../../components/Icons'
import {
  buttonStyles,
  cardIconStyles,
  cn,
  connectionDotStyles,
  formControlStyles,
  noticeStyles,
  pageMessageStyles,
  sectionKickerStyles,
} from '../../styles'
import type { Participant } from '../../types'
import { useRoomState } from '../../useRoomState'
import { ManagerPanel } from './ManagerPanel'
import { NowPlaying } from './NowPlaying'
import { QueuePanel } from './QueuePanel'
import { SearchPanel } from './SearchPanel'

export function RoomPage() {
  const params = useParams()
  const code = normalizeRoomCode(params.code)
  const { room, setRoom, loading, connected, error: roomError } = useRoomState(code)
  const [participant, setParticipant] = useState<Participant | null>(null)
  const [participantToken, setParticipantToken] = useState(
    () => localStorage.getItem(participantTokenKey(code)) ?? '',
  )
  const [nickname, setNickname] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(''), 3_000)
    return () => window.clearTimeout(timer)
  }, [message])

  useEffect(() => {
    if (!participantToken) return
    let active = true
    void api
      .getMe(code, participantToken)
      .then((me) => {
        if (active) setParticipant(me)
      })
      .catch(() => {
        if (!active) return
        localStorage.removeItem(participantTokenKey(code))
        setParticipantToken('')
        setParticipant(null)
      })
    return () => {
      active = false
    }
  }, [code, participantToken])

  const songsLeft = useMemo(() => {
    if (!room || !participant) return 0
    const ownActiveSongs = [room.currentSong, ...room.queue].filter(
      (song) => song?.addedById === participant.id,
    ).length
    return Math.max(0, room.maxSongsPerParticipant - ownActiveSongs)
  }, [participant, room])
  const isManager =
    Boolean(participant) && room?.managerParticipantId === participant?.id

  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    try {
      const joined = await api.joinRoom(code, nickname)
      localStorage.setItem(participantTokenKey(code), joined.participantToken)
      setParticipantToken(joined.participantToken)
      setParticipant(joined.participant)
      setRoom(joined.room)
    } catch (requestError) {
      setError((requestError as Error).message)
    }
  }

  async function addSong(videoId: string) {
    if (!participantToken || songsLeft <= 0) return
    const startsPlayingImmediately = !room?.currentSong
    setError('')
    setMessage('')
    try {
      setRoom(await api.addSong(code, participantToken, videoId))
      setMessage(
        startsPlayingImmediately
          ? '첫 곡을 바로 재생합니다.'
          : '대기열에 추가했습니다.',
      )
    } catch (requestError) {
      setError((requestError as Error).message)
    }
  }

  async function runManagerAction(action: () => Promise<NonNullable<typeof room>>) {
    if (!participantToken) {
      throw new Error('이 방에 다시 참여해주세요.')
    }
    setRoom(await action())
  }

  function runQueueAction(action: () => Promise<NonNullable<typeof room>>) {
    setError('')
    void runManagerAction(action).catch((requestError) => {
      setError((requestError as Error).message)
    })
  }

  if (loading) {
    return (
      <main className={pageMessageStyles}>
        <Brand className="absolute top-[26px] left-[30px]" />
        <h1 className="mt-4 text-[clamp(24px,4vw,38px)]">방에 연결하는 중…</h1>
      </main>
    )
  }
  if (!room) {
    return (
      <main className={pageMessageStyles}>
        <Brand className="absolute top-[26px] left-[30px]" />
        <h1 className="mt-4 text-[clamp(24px,4vw,38px)]">
          {roomError || '방을 찾지 못했습니다.'}
        </h1>
        <Link className={buttonStyles({ intent: 'outline' })} to="/">홈으로</Link>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-canvas bg-[radial-gradient(circle_at_15%_20%,rgba(96,72,163,.17),transparent_30%)] px-3 pt-[17px] pb-20 md:px-[clamp(18px,3vw,46px)] md:pt-[22px]">
      <header className="mx-auto mb-[22px] flex max-w-[920px] items-center justify-between">
        <Brand compactOnMobile />
        <div className="flex items-center gap-[9px] text-[11px] font-bold tracking-[0.08em] text-dim">
          <span className={connectionDotStyles({ connected })} />
          ROOM <strong>{code}</strong>
        </div>
      </header>

      <section className="mx-auto grid max-w-[920px] gap-4">
        <NowPlaying
          song={room.currentSong}
          paused={room.playbackPaused}
          blocked={room.playbackBlocked}
        />
        {participant && isManager && (
          <ManagerPanel
            room={room}
            participantId={participant.id}
            onTogglePlayback={() =>
              runManagerAction(() =>
                api.setPlaybackPaused(
                  code,
                  { participantToken },
                  !room.playbackPaused,
                ),
              )
            }
            onAdvance={() =>
              runManagerAction(() =>
                api.advance(code, { participantToken }),
              )
            }
            onUpdateSettings={(settings) =>
              runManagerAction(() =>
                api.updateRoomSettings(
                  code,
                  { participantToken },
                  settings,
                ),
              )
            }
            onTransfer={(targetParticipantId) =>
              runManagerAction(() =>
                api.transferManager(
                  code,
                  participantToken,
                  targetParticipantId,
                ),
              )
            }
          />
        )}
        <QueuePanel
          songs={room.queue}
          onMove={
            isManager
              ? (songId, direction) =>
                  runQueueAction(() =>
                    api.moveSong(
                      code,
                      { participantToken },
                      songId,
                      direction,
                    ),
                  )
              : undefined
          }
          onRemove={
            isManager
              ? (songId) =>
                  runQueueAction(() =>
                    api.removeSong(
                      code,
                      { participantToken },
                      songId,
                    ),
                  )
              : undefined
          }
        />
        {participant && (
          <SearchPanel songsLeft={songsLeft} onAddSong={addSong} />
        )}
      </section>

      {!participant && (
        <div className="fixed inset-0 z-20 grid place-items-center bg-[#040307]/75 p-5 backdrop-blur-[18px]">
          <form
            className="flex w-full max-w-[420px] flex-col rounded-[18px] border border-purple/30 bg-[#121017] p-6 shadow-[0_30px_100px_rgba(0,0,0,.5)] md:p-[30px]"
            onSubmit={join}
          >
            <div className={cardIconStyles()}><MusicIcon size={25} /></div>
            <span className={sectionKickerStyles}>WELCOME TO {code}</span>
            <h1 className="mt-2.5 mb-2 text-[27px] tracking-[-0.04em]">
              어떤 이름으로 참여할까요?
            </h1>
            <p className="mb-7 text-[13px] text-muted">
              신청곡 옆에 표시될 닉네임입니다.
            </p>
            <label
              className="mb-2 text-[11px] font-extrabold tracking-[0.12em] text-dim uppercase"
              htmlFor="nickname"
            >
              닉네임
            </label>
            <input
              className={cn(formControlStyles({ size: 'large' }), 'mb-3')}
              id="nickname"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              minLength={2}
              maxLength={20}
              placeholder="예: 음악대장"
              autoFocus
              required
            />
            <button
              className={buttonStyles({
                intent: 'primary',
                size: 'lg',
                spread: true,
                fullWidth: true,
              })}
              type="submit"
            >
              입장하기 <span>→</span>
            </button>
          </form>
        </div>
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
