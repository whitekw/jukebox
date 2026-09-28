import { API_ORIGIN } from './config.js'

const status = document.querySelector('#status')
const loginSection = document.querySelector('#login-section')
const roomSection = document.querySelector('#room-section')
const loginButton = document.querySelector('#login-button')
const logoutButton = document.querySelector('#logout-button')
const accountName = document.querySelector('#account-name')
const roomSelect = document.querySelector('#room-select')
const roomHint = document.querySelector('#room-hint')
document.querySelector('#open-site').href = API_ORIGIN

function showStatus(message, error = false) {
  status.textContent = message
  status.hidden = !message
  status.classList.toggle('error', error)
}

function render(state) {
  showStatus('')
  loginSection.hidden = state.loggedIn
  roomSection.hidden = !state.loggedIn
  if (!state.loggedIn) return

  accountName.textContent = state.user.displayName
  roomSelect.replaceChildren()
  if (state.rooms.length === 0) {
    roomSelect.disabled = true
    roomHint.textContent = '참여한 방이 없어요. B-SIDE에서 방에 참여한 뒤 다시 열어주세요.'
    return
  }
  roomSelect.disabled = false
  if (state.rooms.length > 1 && !state.selectedRoom) {
    roomSelect.add(new Option('방을 선택해주세요', ''))
  }
  for (const room of state.rooms) {
    const description = room.currentSongTitle ?? '재생 대기 중'
    roomSelect.add(new Option(`${room.code} · ${description} · 온라인 ${room.onlineCount}명`, room.code))
  }
  roomSelect.value = state.selectedRoom
  roomHint.textContent = state.selectedRoom
    ? 'YouTube에서 영상 썸네일이나 제목을 우클릭해 대기열에 추가하세요.'
    : '영상 추가 전에 방을 선택해주세요.'
}

async function send(type, fields = {}) {
  const response = await chrome.runtime.sendMessage({ type, ...fields })
  if (!response?.ok) throw new Error(response?.message ?? '요청에 실패했습니다.')
  return response.state
}

loginButton.addEventListener('click', async () => {
  loginButton.disabled = true
  showStatus('Discord 연결 중...')
  try {
    render(await send('LOGIN'))
  } catch (error) {
    showStatus(error.message, true)
  } finally {
    loginButton.disabled = false
  }
})

logoutButton.addEventListener('click', async () => {
  logoutButton.disabled = true
  try {
    render(await send('LOGOUT'))
  } catch (error) {
    showStatus(error.message, true)
  } finally {
    logoutButton.disabled = false
  }
})

roomSelect.addEventListener('change', async () => {
  if (!roomSelect.value) return
  try {
    render(await send('SELECT_ROOM', { code: roomSelect.value }))
  } catch (error) {
    showStatus(error.message, true)
  }
})

send('GET_STATE').then(render).catch((error) => showStatus(error.message, true))
