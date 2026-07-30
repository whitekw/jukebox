import { useCallback, useMemo, useState } from 'react'
import QRCode from 'react-qr-code'
import { Link, useParams } from 'react-router-dom'
import { api, hostTokenKey, normalizeRoomCode } from '../api'
import { Brand } from '../components/Brand'
import { CopyIcon, MusicIcon, SkipIcon } from '../components/Icons'
import { SongList } from '../components/SongList'
import { YouTubePlayer } from '../components/YouTubePlayer'
import {
  buttonStyles,
  cn,
  connectionDotStyles,
  noticeStyles,
  pageMessageStyles,
  sectionKickerStyles,
  vinylStyles,
} from '../styles'
import { useRoomState } from '../useRoomState'

export function HostPage() {
  const params = useParams()
  const code = normalizeRoomCode(params.code)
  const { room, setRoom, loading, connected, error: roomError } = useRoomState(code)
  const hostToken = localStorage.getItem(hostTokenKey(code)) ?? ''
  const [actionError, setActionError] = useState('')
  const [copied, setCopied] = useState(false)
  const joinUrl = useMemo(() => `${window.location.origin}/room/${code}`, [code])

  const runAction = useCallback(async (action: () => Promise<NonNullable<typeof room>>) => {
    setActionError('')
    try {
      setRoom(await action())
    } catch (requestError) {
      setActionError((requestError as Error).message)
    }
  }, [setRoom])

  const advance = useCallback(() => {
    if (hostToken) void runAction(() => api.advance(code, hostToken))
  }, [code, hostToken, runAction])

  async function copyJoinLink() {
    await navigator.clipboard.writeText(joinUrl)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  if (loading) return <PageMessage title="방을 준비하고 있습니다…" />
  if (!hostToken) {
    return (
      <PageMessage
        title="이 브라우저에는 호스트 키가 없습니다."
        description="방을 만든 브라우저에서 다시 열거나 참여자 화면으로 들어가 주세요."
      >
        <Link
          className={cn(
            buttonStyles({ intent: 'primary', size: 'lg' }),
            'mt-5',
          )}
          to={`/room/${code}`}
        >
          참여자로 입장
        </Link>
      </PageMessage>
    )
  }
  if (!room) return <PageMessage title={roomError || '방을 찾지 못했습니다.'} />

  return (
    <main className="min-h-screen bg-canvas bg-[radial-gradient(circle_at_15%_20%,rgba(96,72,163,.17),transparent_30%)] px-3 pt-[17px] pb-[70px] md:px-[clamp(18px,3vw,46px)] md:pt-[22px] md:pb-[34px]">
      <header className="mx-auto mb-[22px] flex max-w-[1500px] items-center justify-between">
        <Brand compactOnMobile />
        <div className="flex items-center gap-[9px] text-[11px] font-bold tracking-[0.08em] text-dim">
          <span className={connectionDotStyles({ connected })} />
          <span className="hidden md:inline">
            {connected ? '실시간 연결됨' : '재연결 중'}
          </span>
          <button
            className="ml-0 flex h-[38px] items-center gap-[9px] rounded-[9px] border border-line bg-panel px-[13px] text-muted md:ml-2.5"
            type="button"
            onClick={copyJoinLink}
          >
            ROOM
            <strong className="text-base tracking-[0.18em] text-ink">{code}</strong>
            <CopyIcon size={15} />
          </button>
        </div>
      </header>

      <section className="mx-auto grid max-w-[1500px] grid-cols-1 gap-[18px] lg:grid-cols-[minmax(0,1.75fr)_minmax(340px,.85fr)]">
        <div className="min-w-0">
          <div className="relative aspect-video min-h-[200px] overflow-hidden rounded-2xl border border-line bg-[#050507] md:min-h-[260px]">
            {room.currentSong ? (
              <YouTubePlayer
                videoId={room.currentSong.videoId}
                volume={room.hostVolume}
                onEnded={advance}
              />
            ) : (
              <div className="flex size-full flex-col items-center justify-center text-center">
                <div className={vinylStyles}><MusicIcon size={42} /></div>
                <h2 className="mt-[22px] mb-[7px] text-[clamp(22px,3vw,34px)]">
                  첫 신청곡을 기다리는 중
                </h2>
                <p className="m-0 text-muted">QR 코드를 스캔해 음악을 추가해보세요.</p>
              </div>
            )}
          </div>

          <div className="flex items-start justify-between gap-5 px-1.5 pt-[22px] pb-2 md:items-center">
            <div className="min-w-0">
              <span className="flex items-center gap-2 text-[10px] font-black tracking-[0.16em] text-purple-light">
                <i className="size-1.5 rounded-full bg-purple-light shadow-[0_0_10px_#9b7bff]" />
                NOW PLAYING
              </span>
              <h1 className="my-2 max-w-[65vw] overflow-hidden text-ellipsis whitespace-nowrap text-[23px] tracking-[-0.04em] md:my-2 md:max-w-[780px] md:text-[clamp(24px,3vw,39px)]">
                {room.currentSong?.title ?? '아직 재생 중인 곡이 없습니다'}
              </h1>
              <p className="m-0 text-muted">
                {room.currentSong
                  ? `${room.currentSong.artist} · ${room.currentSong.addedBy}의 신청곡`
                  : '참여자가 곡을 추가하면 자동으로 재생합니다.'}
              </p>
            </div>
            <button
              className={cn(
                buttonStyles({ intent: 'outline', size: 'md' }),
                'size-[45px] shrink-0 px-0 md:h-[46px] md:w-auto md:px-4',
              )}
              type="button"
              onClick={advance}
              disabled={!room.currentSong}
            >
              <SkipIcon size={22} />
              <span className="sr-only md:not-sr-only">건너뛰기</span>
            </button>
          </div>
        </div>

        <aside className="min-w-0 rounded-2xl border border-line bg-[#110f16]/75 px-[18px] py-6 lg:min-h-[560px]">
          <div className="mx-[7px] mb-[18px] flex items-end justify-between">
            <div>
              <span className={sectionKickerStyles}>UP NEXT</span>
              <h2 className="mt-1.5 text-[23px] tracking-[-0.03em]">
                대기열 <b className="text-[13px] font-semibold text-dim">{room.queue.length}</b>
              </h2>
            </div>
          </div>
          <SongList
            songs={room.queue}
            emptyMessage="아직 대기 중인 곡이 없습니다."
            onMove={(songId, direction) =>
              void runAction(() => api.moveSong(code, hostToken, songId, direction))
            }
            onRemove={(songId) =>
              void runAction(() => api.removeSong(code, hostToken, songId))
            }
          />
        </aside>
      </section>

      <section className="mx-auto mt-[18px] flex max-w-[1500px] flex-col items-center gap-[22px] rounded-2xl border border-line bg-[linear-gradient(90deg,rgba(155,123,255,.10),rgba(255,255,255,.025))] px-[22px] py-[18px] text-center md:grid md:grid-cols-[auto_1fr] md:text-left lg:grid-cols-[auto_1fr_auto]">
        <div className="grid place-items-center rounded-[9px] bg-white p-[7px]">
          <QRCode value={joinUrl} size={94} />
        </div>
        <div>
          <span className={sectionKickerStyles}>JOIN THE ROOM</span>
          <h2 className="my-[5px] text-lg">휴대폰으로 스캔하고 신청곡을 추가하세요.</h2>
          <p className="m-0 text-[11px] text-dim [overflow-wrap:anywhere]">{joinUrl}</p>
        </div>
        <div className="text-[37px] font-black tracking-[0.2em] text-ink md:col-span-2 md:text-center lg:col-span-1 lg:text-[clamp(32px,5vw,66px)]">
          {code}
        </div>
      </section>

      {(actionError || roomError) && (
        <div className={noticeStyles({ tone: 'error' })}>
          {actionError || roomError}
        </div>
      )}
      {copied && (
        <div className={noticeStyles({ tone: 'success' })}>
          참여 링크를 복사했습니다.
        </div>
      )}
    </main>
  )
}

function PageMessage({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children?: React.ReactNode
}) {
  return (
    <main className={pageMessageStyles}>
      <Brand className="absolute top-[26px] left-[30px]" />
      <div className={vinylStyles}><MusicIcon size={38} /></div>
      <h1 className="mt-4 text-[clamp(24px,4vw,38px)]">{title}</h1>
      {description && <p className="m-0 text-muted">{description}</p>}
      {children}
    </main>
  )
}
