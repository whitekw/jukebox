# API 및 실시간 이벤트 계약

## 1. 공통 규칙

- 기본 경로: 같은 출처의 `/api`
- 요청/응답 형식: `application/json`
- 룸 코드는 서버에서 공백 제거 후 대문자로 정규화합니다.
- 시간 값은 Unix epoch millisecond입니다.
- 변경 API는 성공 시 최신 전체 `RoomState`를 반환하는 것이 기본입니다.
- 프런트와 백엔드는 같은 출처로 배포하는 구조이며 별도 CORS 설정은 없습니다.

## 2. 인증 헤더

사이트 계정 로그인은 `jukebox_session` HttpOnly 쿠키를 사용합니다. 방 단위 권한은 아래 헤더를 계속 사용하며, 로그인 사용자가 만든 방에는 계정 소유권도 함께 저장됩니다.

| 헤더 | 발급 시점 | 용도 |
| --- | --- | --- |
| `x-host-token` | 방 생성 응답 | 호스트 제어, 자동재생 차단 상태 보고 |
| `x-participant-token` | 방 참여 응답 | 참여자 확인, 곡 추가, 채팅, 매니저 제어 및 지정 |

두 토큰은 브라우저 `localStorage`에 다음 키로 저장됩니다.

```text
jukebox:host:{ROOM_CODE}
jukebox:participant:{ROOM_CODE}
```

`controller` 권한이 필요한 API는 `host_only` 방의 올바른 호스트 토큰, 매니저 중 한 명의 참여자 토큰 또는 방 소유자의 로그인 쿠키를 받습니다.

## 3. 공통 데이터 형식

### `RoomState`

```ts
type RoomState = {
  code: string
  hostVolume: number
  playbackMode: 'host_only' | 'all_devices'
  playbackPaused: boolean
  playbackBlocked: boolean
  playbackPositionSeconds: number
  playbackAnchorAt: number
  playbackRevision: number
  serverTime: number
  participants: Array<{
    id: string
    nickname: string
    isManager: boolean
    isOwner: boolean
    isMember: boolean
    online: boolean
  }>
  currentSong: Song | null
  queue: Song[]
}
```

### `Song`

```ts
type Song = {
  id: string
  videoId: string
  title: string
  artist: string
  durationSeconds: number
  thumbnailUrl: string
  addedBy: string
  addedById: string
  addedByAvatarUrl: string | null
  otherControlAvailableAt: number | null
  position: number
}
```

`otherControlAvailableAt`은 신청자가 방을 나갔거나 연결이 끊긴 뒤 다른 참여자가 그 곡을 삭제·건너뛸 수 있게 되는 epoch ms 시각입니다. 신청자가 온라인이면 `null`입니다.

### `VideoSearchResult`

```ts
type VideoSearchResult = {
  videoId: string
  title: string
  artist: string
  durationSeconds: number
  thumbnailUrl: string
  embeddable: boolean
}
```

### `ChatMessage`

```ts
type ChatMessage = {
  id: string
  sequence: number
  type: 'message'
  participantId: string
  nickname: string
  actorType: 'participant'
  content: string
  createdAt: number
}

type RoomEvent = {
  id: string
  sequence: number
  type: 'system'
  participantId: string | null
  nickname: string | null
  actorType: 'participant' | 'host' | 'system'
  eventType:
    | 'song_added' | 'song_skipped' | 'song_removed' | 'queue_reordered'
    | 'playback_paused' | 'playback_resumed'
    | 'manager_added' | 'manager_removed'
  data: Record<string, string | number | boolean>
  createdAt: number
}
```

## 4. 엔드포인트 요약

| Method | Path | 권한 | 제한 그룹 | 응답 |
| --- | --- | --- | --- | --- |
| GET | `/api/health` | 공개 | 없음 | 상태 확인 |
| GET | `/api/config` | 공개 | 없음 | 국가/추천 언어 |
| GET | `/api/auth/session` | 공개 | 없음 | Discord 로그인 활성화 여부와 현재 사용자 |
| GET | `/api/auth/discord` | 공개 | 인증 | Discord OAuth2 시작 |
| GET | `/api/auth/discord/callback` | OAuth state | 인증 | 코드 교환 후 세션 쿠키 발급 |
| POST | `/api/auth/logout` | 로그인 선택 | 변경 | 현재 세션 삭제 및 해당 세션의 실시간 연결 종료 |
| POST | `/api/rooms` | 로그인 | 변경 | 방 생성 정보 |
| GET | `/api/rooms/owned` | 로그인 | 없음 | 계정 소유 방 목록 |
| GET | `/api/rooms/joined` | 로그인 | 없음 | 계정으로 참여한 방 목록(소유 방 제외) |
| GET | `/api/rooms/:code` | 공개 | 없음 | `RoomState` |
| GET | `/api/rooms/:code/session` | 방 세션 또는 소유자 | 없음 | 저장 세션과 소유권 확인 |
| POST | `/api/rooms/:code/host` | 방 소유자 | 변경 | 새 호스트 토큰과 `RoomState` |
| POST | `/api/rooms/:code/join` | 공개 | 변경 | 익명 참여 또는 로그인 계정 멤버십 생성, 참여 토큰/정보/룸 |
| POST | `/api/rooms/:code/resume` | 로그인 멤버 | 변경 | 다른 기기에서 멤버십을 재개할 참여 토큰/정보/룸 |
| DELETE | `/api/rooms/:code/membership` | 로그인 멤버 | 변경 | 방 나가기(소유자는 불가), `204` |
| GET | `/api/rooms/:code/me` | 참여자 | 없음 | 내 참여 정보/남은 곡 수 |
| GET | `/api/rooms/:code/messages` | 참여자 | 없음 | 최근 채팅·활동 100개 |
| POST | `/api/rooms/:code/messages` | 참여자 | 없음 | `ChatMessage` |
| GET | `/api/youtube/search` | 공개 | 검색 | 검색 결과 |
| POST | `/api/rooms/:code/songs` | 참여자 | 변경 | `RoomState` |
| POST | `/api/rooms/:code/advance` | controller·신청자·자리를 비운 신청자의 곡에 대한 참여자 | 변경 | `RoomState` |
| PATCH | `/api/rooms/:code/playback` | controller | 변경 | `RoomState` |
| POST | `/api/rooms/:code/playback/start` | 인증된 방 세션 | 변경 | `RoomState` |
| PATCH | `/api/rooms/:code/playback/autoplay-blocked` | 호스트 | 변경 | `RoomState` |
| DELETE | `/api/rooms/:code/songs/:songId` | controller·신청자·자리를 비운 신청자의 곡에 대한 참여자 | 변경 | `RoomState` |
| POST | `/api/rooms/:code/songs/:songId/move` | controller | 변경 | `RoomState` |
| PATCH | `/api/rooms/:code/settings` | controller | 변경 | `RoomState` |
| PATCH | `/api/rooms/:code/managers/:participantId` | controller | 변경 | `RoomState` |
| POST | `/api/rooms/:code/participants/:participantId/disconnect` | 방 소유자 | 변경 | 대상의 현재 연결 종료, `RoomState` |

요청 제한은 현재 프로세스에서 IP와 요청 경로별로 계산합니다. 검색 그룹은 60초당 30회, 변경 그룹은 60초당 120회입니다. 채팅 조회와 전송에는 별도 요청 제한을 적용하지 않습니다.

## 5. 시스템 및 설정

### `GET /api/health`

```json
{
  "ok": true,
  "service": "jukebox-backend"
}
```

### `GET /api/config`

Cloudflare의 `CF-IPCountry`와 `Accept-Language`를 이용해 초기 언어를 제안합니다.

```json
{
  "countryCode": "KR",
  "suggestedLocale": "ko"
}
```

지원 언어는 `ko`, `ja`, `en`입니다. 사용자가 브라우저에 저장한 언어가 있으면 프런트는 이 추천보다 저장 값을 우선합니다.

### Discord 로그인

`GET /api/auth/session`은 로그인 설정이 없을 때도 `200`을 반환합니다.

```json
{
  "enabled": true,
  "user": {
    "id": "내부 UUID",
    "discordId": "123456789",
    "username": "discord-user",
    "displayName": "Music Friend",
    "avatarUrl": "https://cdn.discordapp.com/avatars/..."
  }
}
```

비로그인 상태의 `user`는 `null`입니다. `GET /api/auth/discord?returnTo=/room/ABC234`는 `identify` 범위로 Discord 인증 화면에 리다이렉트합니다. callback은 10분 수명의 HttpOnly state 쿠키를 검증하고 성공 시 기본 30일 수명의 `jukebox_session` 쿠키를 설정합니다. `returnTo`는 같은 출처의 `/`로 시작하는 경로만 허용합니다. `POST /api/auth/logout`은 서버 세션과 쿠키를 삭제하고, 그 세션으로 인증한 Socket.IO 연결을 종료한 뒤 `204`를 반환합니다. 방 멤버십은 삭제하지 않습니다.

## 6. 방과 참여자

### `POST /api/rooms`

요청:

```json
{
  "playbackMode": "all_devices"
}
```

- `playbackMode`는 `host_only` 또는 `all_devices`이며 생략 시 `host_only`입니다.
- Discord 로그인이 필요하며, 비로그인 요청은 `401 AUTH_REQUIRED`로 거부합니다.
- 방은 로그인 계정에 소유권이 저장되고 소유자가 직접 삭제하기 전까지 유지됩니다.
- 최초 참여자는 계정 이름과 프로필 사진으로 방과 한 트랜잭션에서 함께 생성됩니다.
- `hostToken`은 `host_only` 모드에서만 발급됩니다. `all_devices` 응답에는 포함되지 않습니다.
- 응답 상태: `201 Created`

응답:

```json
{
  "code": "ABC234",
  "hostToken": "원본-호스트-토큰",
  "playbackMode": "host_only",
  "participantToken": "원본-참여자-토큰",
  "participant": {
    "id": "참여자-UUID",
    "nickname": "Alice",
    "isManager": true
  }
}
```

### `GET /api/rooms/owned`

로그인 계정이 소유한 방을 최신 생성 순서로 반환합니다. 응답은 `{ "items": RoomState[] }` 형식이며 비로그인 요청은 `401 AUTH_REQUIRED`입니다.

### `POST /api/rooms/:code/host`

`host_only` 방의 소유자가 현재 기기를 재생 기기로 지정합니다. 새 `hostToken`을 발급하고 기존 토큰을 폐기하며, 기존 호스트 소켓에 `room:host-revoked`를 전송합니다. `all_devices` 방에서는 `409 HOST_ONLY_REQUIRED`를 반환합니다.

### `GET /api/rooms/:code`

존재하는 방의 공개 `RoomState`를 반환합니다. 토큰 해시와 내부 레코드 ID는 노출하지 않습니다. 단, UI 동기화와 매니저 표시에 필요한 참여자 ID 및 곡 ID는 공개 상태에 포함됩니다.

### `POST /api/rooms/:code/join`

요청:

```json
{ "nickname": "Alice" }
```

- 앞뒤 공백을 제거한 길이가 `1..20`이어야 합니다. 로그인 사용자는 Discord 표시 이름을 닉네임으로 사용합니다.
- 닉네임 중복은 허용됩니다.
- 방 생성 시 생성자가 매니저가 되며, 이후 참여자는 자동으로 매니저가 되지 않습니다.
- 응답 상태: `201 Created`

응답:

```json
{
  "participantToken": "원본-참여자-토큰",
  "participant": {
    "id": "uuid",
    "nickname": "Alice",
    "isManager": true
  },
  "room": {}
}
```

### `GET /api/rooms/:code/me`

필수 헤더: `x-participant-token`

```json
{
  "id": "uuid",
  "nickname": "Alice",
  "isManager": true
}
```

## 7. 방 채팅

### `GET /api/rooms/:code/messages`

필수 헤더: `x-participant-token`

방의 최근 사용자 메시지와 시스템 활동 로그를 합쳐 최대 100개까지 오래된 순으로 반환합니다.

```json
{
  "items": [
    {
      "id": "uuid",
      "sequence": 1,
      "type": "message",
      "participantId": "uuid",
      "nickname": "Alice",
      "actorType": "participant",
      "content": "안녕하세요",
      "createdAt": 1789540800000
    },
    {
      "id": "uuid",
      "sequence": 2,
      "type": "system",
      "participantId": "uuid",
      "nickname": "Alice",
      "actorType": "participant",
      "eventType": "song_added",
      "data": { "title": "Example" },
      "createdAt": 1789540801000
    }
  ]
}
```

### `POST /api/rooms/:code/messages`

필수 헤더: `x-participant-token`

```json
{ "content": "안녕하세요" }
```

앞뒤 공백을 제거한 일반 텍스트 `1..300`자만 허용합니다. 성공하면 `201 Created`와 저장된 `ChatMessage`를 반환하고, 인증된 방 참여자에게 `chat:message`로 전달합니다. 메시지 삭제 API는 제공하지 않습니다.

건너뛰기·대기열 삭제·순서 변경·전체 일시정지/재개·관리자 지정/해제도 `RoomEvent`로 저장되어 같은 `chat:message` 이벤트로 전달됩니다. 곡 추가는 대기열에 신청자가 표시되므로 활동 로그를 생성하지 않습니다. 입장·퇴장은 채팅 피드에 기록하지 않으며, 이전 버전에서 저장된 입장·퇴장 로그도 조회 결과에서 제외합니다.

## 8. YouTube 조회

### `GET /api/youtube/search?q={query}`

- 일반 검색어는 공백 제거 후 `2..100`자여야 합니다.
- 지원하는 YouTube URL 또는 11자리 영상 ID라면 단일 영상 직접 조회로 처리합니다.
- 검색 결과는 공개 상태이며 라이브가 아니고 외부 재생 가능한 영상만 반환합니다.

```json
{
  "items": [
    {
      "videoId": "dQw4w9WgXcQ",
      "title": "Example",
      "artist": "Example Channel",
      "durationSeconds": 212,
      "thumbnailUrl": "https://...",
      "embeddable": true
    }
  ]
}
```

## 9. 신청곡과 재생 제어

### `POST /api/rooms/:code/songs`

필수 헤더: `x-participant-token`

요청:

```json
{ "videoId": "dQw4w9WgXcQ" }
```

`input` 필드도 백엔드에서는 지원하지만 현재 프런트는 `videoId`를 사용합니다. YouTube 서비스가 영상을 다시 검증한 뒤 다음 규칙을 적용합니다.

- 참여자의 활성 곡 수가 방 한도보다 작아야 합니다.
- 같은 방의 `current` 또는 `queued` 상태에 같은 `videoId`가 없어야 합니다.
- 현재 곡이 없으면 새 곡은 즉시 `current`, 있으면 대기열 끝의 `queued`가 됩니다.
- 응답 상태: `201 Created`

### `POST /api/rooms/:code/advance`

필수 권한: controller, 신청자 또는 신청자가 명시적으로 방을 나갔거나 마지막 연결이 끊긴 지 1분이 지난 경우의 다른 참여자

- 현재 곡을 `played`로 바꿉니다.
- 가장 앞의 `queued` 곡을 `current`로 바꿉니다.
- 대기 곡이 없으면 `currentSong`은 `null`이 됩니다.
- 일시정지와 자동재생 차단 상태를 초기화합니다.

### `PATCH /api/rooms/:code/playback`

필수 권한: controller

```json
{ "paused": true }
```

현재 곡이 있어야 하며 boolean만 허용합니다. 명시적인 재생 상태 변경은 자동재생 차단 플래그를 해제합니다.

이 API는 관리자 화면의 `전체 일시정지`·`전체 재생` 버튼에서만 호출합니다. YouTube IFrame 내부의 재생·일시정지 조작은 해당 브라우저에만 적용되며 전역 `playbackPaused`를 변경하지 않습니다. 로컬 일시정지 후 재생하면 클라이언트는 아래 서버 기준 예상 위치로 이동한 뒤 재생합니다.

재생 위치는 서버가 `playbackPositionSeconds`와 `playbackAnchorAt`을 기준점으로 관리합니다. 재생 중인 클라이언트는 `serverTime`으로 서버 시계 오차를 추정하고 다음 위치를 계산합니다.

```text
position = playbackPositionSeconds
         + (serverNow - playbackAnchorAt) / 1000
```

`playbackRevision`은 곡 변경, 일시정지/재개, 호스트 전용 자동재생 차단 상태 변경 때 증가합니다.

### `POST /api/rooms/:code/playback/start`

필수 권한: 유효한 호스트 또는 참여자 세션

모든 기기 모드에서 새 곡이 `pending`일 때 실제 재생을 먼저 시작한 기기가 영상 ID와 현재 위치를 보고합니다. 관리자가 자기 기기만 로컬 일시정지한 상황에서도 다른 참여자가 타임라인을 시작할 수 있습니다. 첫 유효 보고만 반영되며 이후 요청은 현재 상태를 그대로 반환합니다.

### `PATCH /api/rooms/:code/playback/autoplay-blocked`

필수 헤더: `x-host-token`

```json
{ "blocked": true }
```

실제 YouTube IFrame을 가진 호스트만 보고할 수 있습니다. `blocked: true`이면 서버는 `playbackPaused`도 함께 `true`로 저장합니다.

이 전역 차단 상태는 `host_only` 모드에만 적용합니다. `all_devices` 모드의 자동재생 차단은 기기별 UI에서 해제하며 다른 기기의 재생을 멈추지 않습니다.

### `DELETE /api/rooms/:code/songs/:songId`

필수 권한: controller, 신청자 또는 신청자가 명시적으로 방을 나갔거나 마지막 연결이 끊긴 지 1분이 지난 경우의 다른 참여자. `queued` 상태의 곡만 `removed`로 바꿀 수 있습니다. 현재 재생 곡 삭제는 지원하지 않습니다.

### `POST /api/rooms/:code/songs/:songId/move`

필수 권한: controller

```json
{ "direction": "up" }
```

`up` 또는 `down`만 허용하며 인접한 `queued` 곡의 `position` 값을 교환합니다.

### `PATCH /api/rooms/:code/settings`

필수 권한: controller

```json
{
  "hostVolume": 35
}
```

- `hostVolume`: 정수 `0..100`

### `PATCH /api/rooms/:code/managers/:participantId`

권한: 방 소유자의 로그인 세션 또는 관리자의 `x-participant-token`

```json
{ "isManager": true }
```

같은 방의 소유자가 아닌 참여자에게 관리 권한을 추가하거나 해제합니다. 관리자가 없어도 방 소유자는 관리 권한을 사용할 수 있습니다. 소유자 자신은 `OWNER_MODERATION_FORBIDDEN`으로 변경할 수 없습니다.

### `POST /api/rooms/:code/participants/:participantId/disconnect`

방 소유자의 로그인 세션이 필요합니다. 대상의 현재 Socket.IO 연결을 모두 종료하고 즉시 오프라인으로 표시합니다. 로그인 멤버십과 익명 참여 토큰은 유지되므로 다시 입장할 수 있습니다. 연결 중이 아니면 `PARTICIPANT_OFFLINE`을 반환합니다. 방 소유자를 대상으로 할 수 없습니다.

## 10. Socket.IO 계약

Socket.IO는 REST 서버와 같은 origin 및 포트를 사용합니다.

### 클라이언트 → 서버: `time:sync`

콜백으로 `{ "serverTime": 1789540800000 }`을 반환합니다. 클라이언트는 요청 왕복 시간의 중간값과 비교해 서버 시계 오차를 계산하며 연결 직후와 30초 간격으로 갱신합니다.

### 클라이언트 → 서버: `room:subscribe`

```ts
socket.emit(
  'room:subscribe',
  { code: 'ABC234' },
  (result) => { /* acknowledge */ },
)
```

성공 acknowledge:

```json
{ "ok": true }
```

실패 acknowledge:

```json
{
  "ok": false,
  "code": "ROOM_NOT_FOUND",
  "message": "존재하지 않는 방입니다."
}
```

공개 룸 상태 구독 자체는 인증이 필요하지 않습니다. 성공하면 서버는 소켓을 `room:{CODE}` 채널에 넣고 즉시 현재 `room:state`를 한 번 보냅니다. 유효한 참여자 토큰을 함께 보낸 소켓만 별도의 `chat-room:{CODE}` 채널에도 들어갑니다.

### 서버 → 클라이언트: `room:state`

payload는 전체 `RoomState`입니다. 참여, 곡 추가/이동/삭제, 재생 상태, 방 설정, 매니저 변경 후 해당 방의 모든 구독자에게 전달됩니다.

### 서버 → 클라이언트: `room:disconnected`

방 소유자가 연결을 끊은 대상의 소켓에만 전송합니다. 클라이언트는 홈으로 이동하고 해당 소켓은 서버에서 강제로 종료됩니다. 멤버십과 참여 토큰이 유지되어 다시 참여할 수 있습니다.

### 서버 → 클라이언트: `chat:message`

payload는 새로 저장된 `ChatMessage` 또는 `RoomEvent`입니다. 유효한 참여자 토큰으로 구독한 해당 방의 소켓에만 전달됩니다. 재접속 중 이벤트를 놓친 경우 REST의 최근 기록과 항목 ID를 기준으로 병합합니다.

## 11. 오류 계약

```json
{
  "error": {
    "code": "DUPLICATE_SONG",
    "message": "이미 재생 중이거나 대기열에 있는 곡입니다."
  }
}
```

대표 오류 코드:

| 분류 | 코드 |
| --- | --- |
| 요청 | `INVALID_JSON`, `INVALID_QUERY`, `INVALID_NICKNAME`, `INVALID_CHAT_MESSAGE`, `INVALID_DIRECTION`, `INVALID_PLAYBACK_MODE`, `EMPTY_SETTINGS` |
| 인증/권한 | `PARTICIPANT_REQUIRED`, `MANAGER_FORBIDDEN`, `HOST_FORBIDDEN`, `HOST_ONLY_REQUIRED`, `CONTROL_FORBIDDEN`, `OWNER_FORBIDDEN`, `OWNER_MODERATION_FORBIDDEN` |
| 방/곡 | `ROOM_NOT_FOUND`, `DUPLICATE_SONG`, `SONG_NOT_FOUND`, `NO_CURRENT_SONG` |
| 설정/관리자 | `INVALID_HOST_VOLUME`, `PARTICIPANT_NOT_FOUND`, `PARTICIPANT_OFFLINE`, `INVALID_MANAGER_STATE` |
| YouTube | `YOUTUBE_NOT_CONFIGURED`, `YOUTUBE_UNAVAILABLE`, `YOUTUBE_API_ERROR`, `INVALID_VIDEO`, `VIDEO_NOT_PLAYABLE` |
| 인프라 | `RATE_LIMITED`, `INTERNAL_ERROR` |

응답에는 `RateLimit-Limit`와 `RateLimit-Remaining` 헤더가 제한 대상 요청에 포함됩니다. 제한을 넘으면 HTTP 429와 `RATE_LIMITED`를 반환합니다.
