import { useCallback, useMemo, useState } from 'react'
import QRCode from 'react-qr-code'
import { Link, useParams } from 'react-router-dom'
import { api, hostTokenKey, normalizeRoomCode } from '../api'
import { Brand } from '../components/Brand'
import { CopyIcon, MusicIcon, SkipIcon } from '../components/Icons'
import { SongList } from '../components/SongList'
import { YouTubePlayer } from '../components/YouTubePlayer'
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
        <Link className="primary-button inline-button" to={`/room/${code}`}>참여자로 입장</Link>
      </PageMessage>
    )
  }
  if (!room) return <PageMessage title={roomError || '방을 찾지 못했습니다.'} />

  return (
    <main className="host-shell">
      <header className="host-header">
        <Brand />
        <div className="host-room-meta">
          <span className={`connection-dot ${connected ? 'online' : ''}`} />
          {connected ? '실시간 연결됨' : '재연결 중'}
          <button className="room-code-pill" type="button" onClick={copyJoinLink}>
            ROOM <strong>{code}</strong> <CopyIcon size={15} />
          </button>
        </div>
      </header>

      <section className="host-layout">
        <div className="player-column">
          <div className="player-frame">
            {room.currentSong ? (
              <YouTubePlayer
                videoId={room.currentSong.videoId}
                volume={room.hostVolume}
                onEnded={advance}
              />
            ) : (
              <div className="player-placeholder">
                <div className="vinyl"><MusicIcon size={42} /></div>
                <h2>첫 신청곡을 기다리는 중</h2>
                <p>QR 코드를 스캔해 음악을 추가해보세요.</p>
              </div>
            )}
          </div>

          <div className="now-playing-card">
            <div>
              <span className="live-label"><i /> NOW PLAYING</span>
              <h1>{room.currentSong?.title ?? '아직 재생 중인 곡이 없습니다'}</h1>
              <p>
                {room.currentSong
                  ? `${room.currentSong.artist} · ${room.currentSong.addedBy}의 신청곡`
                  : '참여자가 곡을 추가하면 자동으로 재생합니다.'}
              </p>
            </div>
            <button
              className="skip-button"
              type="button"
              onClick={advance}
              disabled={!room.currentSong}
            >
              <SkipIcon size={22} /> 건너뛰기
            </button>
          </div>
        </div>

        <aside className="queue-panel">
          <div className="panel-heading">
            <div>
              <span className="section-kicker">UP NEXT</span>
              <h2>대기열 <b>{room.queue.length}</b></h2>
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

      <section className="join-strip">
        <div className="qr-box"><QRCode value={joinUrl} size={94} /></div>
        <div>
          <span className="section-kicker">JOIN THE ROOM</span>
          <h2>휴대폰으로 스캔하고 신청곡을 추가하세요.</h2>
          <p>{joinUrl}</p>
        </div>
        <div className="giant-code">{code}</div>
      </section>

      {(actionError || roomError) && <div className="global-error">{actionError || roomError}</div>}
      {copied && <div className="toast">참여 링크를 복사했습니다.</div>}
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
    <main className="page-message">
      <Brand />
      <div className="vinyl"><MusicIcon size={38} /></div>
      <h1>{title}</h1>
      {description && <p>{description}</p>}
      {children}
    </main>
  )
}
