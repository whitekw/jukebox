import { API_ORIGIN } from './config.js'
import { extractYouTubeVideoId } from './video-url.js'

const MENU_ID = 'add-to-bside'

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'B-SIDE 대기열에 추가',
    contexts: ['link'],
    documentUrlPatterns: [
      'https://www.youtube.com/*',
      'https://youtube.com/*',
      'https://m.youtube.com/*',
      'https://music.youtube.com/*',
    ],
    targetUrlPatterns: [
      'https://www.youtube.com/watch*',
      'https://youtube.com/watch*',
      'https://m.youtube.com/watch*',
      'https://music.youtube.com/watch*',
      'https://www.youtube.com/shorts/*',
      'https://www.youtube.com/live/*',
      'https://youtu.be/*',
    ],
  })
})

void chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })

function randomValue() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

async function codeChallenge(verifier) {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)),
  )
  return btoa(String.fromCharCode(...digest))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

async function apiRequest(path, { token, method = 'GET', body } = {}) {
  let response
  try {
    response = await fetch(`${API_ORIGIN}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  } catch {
    throw new Error('B-SIDE 서버에 연결하지 못했습니다. 서버 주소와 확장 프로그램 ID를 확인해주세요.')
  }
  if (response.status === 204) return null
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(result.error?.message ?? '요청에 실패했습니다.')
    error.code = result.error?.code ?? 'API_ERROR'
    error.status = response.status
    throw error
  }
  return result
}

async function clearSession() {
  await chrome.storage.local.remove(['session', 'selectedRoom'])
}

async function getSession() {
  const { session } = await chrome.storage.local.get('session')
  if (!session?.token) return null
  if (session.expiresAt <= Date.now()) {
    await clearSession()
    return null
  }
  return session
}

async function requireSession() {
  const session = await getSession()
  if (!session) throw new Error('확장 프로그램에서 Discord로 로그인해주세요.')
  return session
}

async function login() {
  const { enabled, extensionAllowed } = await apiRequest(
    `/api/extension/auth/ready?extension_id=${encodeURIComponent(chrome.runtime.id)}`,
  )
  if (!enabled) throw new Error('B-SIDE 서버에 Discord 로그인이 설정되지 않았습니다.')
  if (extensionAllowed === false) {
    throw new Error(`확장 프로그램 ID(${chrome.runtime.id})가 ${API_ORIGIN} 서버에 등록되지 않았습니다. 해당 서버의 BROWSER_EXTENSION_IDS를 설정하고 백엔드를 재시작해주세요.`)
  }
  const verifier = randomValue()
  const state = randomValue()
  const redirectUri = chrome.identity.getRedirectURL('bside')
  const url = new URL(`${API_ORIGIN}/api/extension/auth/start`)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', await codeChallenge(verifier))

  let redirectedTo
  try {
    redirectedTo = await chrome.identity.launchWebAuthFlow({
      url: url.toString(),
      interactive: true,
    })
  } catch (error) {
    if (/user (rejected|cancelled)|canceled/i.test(error.message)) {
      throw new Error('Discord 로그인이 취소되었습니다.')
    }
    throw new Error(`인증 페이지를 열지 못했습니다. ${API_ORIGIN} 서버와 Discord 리디렉션 설정을 확인해주세요. (${error.message})`)
  }
  if (!redirectedTo || !redirectedTo.startsWith(`${redirectUri}?`)) {
    throw new Error('로그인 응답이 올바르지 않습니다.')
  }
  const response = new URL(redirectedTo)
  if (response.searchParams.get('state') !== state) {
    throw new Error('로그인 요청을 확인하지 못했습니다.')
  }
  if (response.searchParams.has('error')) {
    throw new Error('Discord 로그인이 취소되었거나 실패했습니다.')
  }
  const grant = response.searchParams.get('grant')
  if (!grant) throw new Error('로그인 인증 정보가 없습니다.')
  const session = await apiRequest('/api/extension/auth/exchange', {
    method: 'POST',
    body: { grant, codeVerifier: verifier, extensionId: chrome.runtime.id },
  })
  await chrome.storage.local.set({ session })
  return getState()
}

async function getState() {
  const session = await getSession()
  if (!session) return { loggedIn: false, rooms: [], selectedRoom: '' }
  try {
    const [profile, roomList, storage] = await Promise.all([
      apiRequest('/api/extension/me', { token: session.token }),
      apiRequest('/api/extension/rooms', { token: session.token }),
      chrome.storage.local.get('selectedRoom'),
    ])
    const rooms = roomList.items
    const selectedRoom = rooms.some((room) => room.code === storage.selectedRoom)
      ? storage.selectedRoom
      : rooms.length === 1 ? rooms[0].code : ''
    if (selectedRoom !== storage.selectedRoom) {
      await chrome.storage.local.set({ selectedRoom })
    }
    return { loggedIn: true, user: profile.user, rooms, selectedRoom }
  } catch (error) {
    if (error.status === 401) {
      await clearSession()
      return { loggedIn: false, rooms: [], selectedRoom: '' }
    }
    throw error
  }
}

async function logout() {
  const session = await getSession()
  if (session) {
    try {
      await apiRequest('/api/extension/logout', { token: session.token, method: 'POST' })
    } finally {
      await clearSession()
    }
  }
  return { loggedIn: false, rooms: [], selectedRoom: '' }
}

async function selectRoom(code) {
  const state = await getState()
  if (!state.loggedIn || !state.rooms.some((room) => room.code === code)) {
    throw new Error('참여 중인 방을 선택해주세요.')
  }
  await chrome.storage.local.set({ selectedRoom: code })
  return { ...state, selectedRoom: code }
}

async function notify(title, message) {
  await chrome.notifications.create({
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icon.png'),
    title,
    message,
  })
}

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== MENU_ID) return
  void (async () => {
    const videoId = extractYouTubeVideoId(info.linkUrl)
    if (!videoId) {
      await notify('B-SIDE', 'YouTube 영상 링크를 우클릭해주세요.')
      return
    }
    const session = await requireSession()
    let { selectedRoom } = await chrome.storage.local.get('selectedRoom')
    if (!selectedRoom) ({ selectedRoom } = await getState())
    if (!selectedRoom) {
      throw new Error('확장 프로그램 아이콘을 눌러 방을 선택해주세요.')
    }
    const room = await apiRequest(
      `/api/extension/rooms/${encodeURIComponent(selectedRoom)}/songs`,
      { token: session.token, method: 'POST', body: { videoId } },
    )
    await notify('B-SIDE 대기열에 추가됨', `${room.currentSong?.videoId === videoId ? '현재 재생' : '대기열'} · ${selectedRoom}`)
  })().catch(async (error) => {
    if (error.status === 401 && error.code === 'EXTENSION_AUTH_REQUIRED') {
      await clearSession()
    }
    await notify('B-SIDE에 추가하지 못했어요', error.message)
  })
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const actions = {
    GET_STATE: getState,
    LOGIN: login,
    LOGOUT: logout,
    SELECT_ROOM: () => selectRoom(message.code),
  }
  const action = actions[message?.type]
  if (!action) return false
  Promise.resolve()
    .then(action)
    .then((state) => sendResponse({ ok: true, state }))
    .catch((error) => sendResponse({ ok: false, message: error.message }))
  return true
})
