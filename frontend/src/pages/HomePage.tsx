import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, hostTokenKey, normalizeRoomCode } from '../api'
import { Brand } from '../components/Brand'
import { MusicIcon, UsersIcon } from '../components/Icons'

export function HomePage() {
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
      setError((requestError as Error).message)
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
    <main className="home-shell">
      <nav className="home-nav">
        <Brand />
        <span className="nav-note">함께 만드는 플레이리스트</span>
      </nav>

      <section className="hero-section">
        <div className="eyebrow"><span /> NO LOGIN · NO APP · JUST MUSIC</div>
        <h1>
          오늘의 음악은
          <br />
          <em>모두가</em> 고릅니다.
        </h1>
        <p>
          한 기기는 재생하고, 모두의 휴대폰은 리모컨이 됩니다.
          <br className="desktop-only" /> QR로 들어와 원하는 곡을 바로 추가하세요.
        </p>
      </section>

      <section className="action-grid">
        <form className="action-card host-card" onSubmit={createRoom}>
          <div className="card-icon"><MusicIcon size={26} /></div>
          <span className="card-kicker">FOR HOST</span>
          <h2>새로운 방 만들기</h2>
          <p>스피커와 연결된 기기에서 시작하세요.</p>
          <label className="field-label" htmlFor="max-songs">한 사람당 대기 곡</label>
          <select
            id="max-songs"
            value={maxSongs}
            onChange={(event) => setMaxSongs(Number(event.target.value))}
          >
            {[1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>{value}곡</option>
            ))}
          </select>
          <button className="primary-button" disabled={creating} type="submit">
            {creating ? '방을 만드는 중…' : '방 만들기'} <span>→</span>
          </button>
        </form>

        <form className="action-card join-card" onSubmit={joinRoom}>
          <div className="card-icon"><UsersIcon size={26} /></div>
          <span className="card-kicker">FOR GUEST</span>
          <h2>플레이리스트 참여</h2>
          <p>화면의 여섯 자리 코드를 입력하세요.</p>
          <label className="field-label" htmlFor="room-code">룸 코드</label>
          <input
            id="room-code"
            className="code-input"
            value={roomCode}
            onChange={(event) => setRoomCode(normalizeRoomCode(event.target.value).slice(0, 6))}
            placeholder="ABC234"
            minLength={6}
            maxLength={6}
            autoComplete="off"
            required
          />
          <button className="secondary-button" type="submit">
            참여하기 <span>→</span>
          </button>
        </form>
      </section>

      {error && <div className="global-error">{error}</div>}

      <footer className="home-footer">
        <span>SELF-HOSTED · OPEN WEB</span>
        <span>Powered by YouTube</span>
      </footer>
    </main>
  )
}

