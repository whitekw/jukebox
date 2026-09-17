# API 및 실시간 이벤트 계약

## 1. 공통 규칙

- 기본 경로: 같은 출처의 `/api`
- 요청/응답 형식: `application/json`
- 룸 코드는 서버에서 공백 제거 후 대문자로 정규화합니다.
- 시간 값은 Unix epoch millisecond입니다.
- 변경 API는 성공 시 최신 전체 `RoomState`를 반환하는 것이 기본입니다.
- 프런트와 백엔드는 같은 출처로 배포하는 구조이며 별도 CORS 설정은 없습니다.

## 2. 인증 헤더

| 헤더 | 발급 시점 | 용도 |
| --- | --- | --- |
| `x-host-token` | 방 생성 응답 | 호스트 제어, 자동재생 차단 상태 보고 |
| `x-participant-token` | 방 참여 응답 | 참여자 확인, 곡 추가, 매니저 제어 및 이전 |

두 토큰은 브라우저 `localStorage`에 다음 키로 저장됩니다.

```text
jukebox:host:{ROOM_CODE}
jukebox:participant:{ROOM_CODE}
```

`controller` 권한이 필요한 API는 올바른 호스트 토큰 또는 현재 매니저의 참여자 토큰 중 하나를 받습니다.

## 3. 공통 데이터 형식

### `RoomState`

```ts
type RoomState = {
  code: string
  expiresAt: number
  managerParticipantId: string | null
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
  position: number
}
```

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

## 4. 엔드포인트 요약

| Method | Path | 권한 | 제한 그룹 | 응답 |
| --- | --- | --- | --- | --- |
| GET | `/api/health` | 공개 | 없음 | 상태 확인 |
| GET | `/api/config` | 공개 | 없음 | 국가/추천 언어 |
| POST | `/api/rooms` | 공개 | 변경 | 방 생성 정보 |
| GET | `/api/rooms/:code` | 공개 | 없음 | `RoomState` |
| POST | `/api/rooms/:code/join` | 공개 | 변경 | 참여 토큰/정보/룸 |
| GET | `/api/rooms/:code/me` | 참여자 | 없음 | 내 참여 정보/남은 곡 수 |
| GET | `/api/youtube/search` | 공개 | 검색 | 검색 결과 |
| GET | `/api/youtube/charts/music` | 공개 | 검색 | 지역별 인기 음악 |
| POST | `/api/rooms/:code/songs` | 참여자 | 변경 | `RoomState` |
| POST | `/api/rooms/:code/advance` | controller | 변경 | `RoomState` |
| PATCH | `/api/rooms/:code/playback` | controller | 변경 | `RoomState` |
| PATCH | `/api/rooms/:code/playback/autoplay-blocked` | 호스트 | 변경 | `RoomState` |
| DELETE | `/api/rooms/:code/songs/:songId` | controller | 변경 | `RoomState` |
| POST | `/api/rooms/:code/songs/:songId/move` | controller | 변경 | `RoomState` |
| PATCH | `/api/rooms/:code/settings` | controller | 변경 | `RoomState` |
| POST | `/api/rooms/:code/manager/transfer` | 매니저 | 변경 | `RoomState` |

요청 제한은 현재 프로세스에서 IP와 요청 경로별로 계산합니다. 검색 그룹은 60초당 30회, 변경 그룹은 60초당 120회입니다.

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

## 6. 방과 참여자

### `POST /api/rooms`

요청:

```json
{
  "playbackMode": "all_devices"
}
```

- `playbackMode`는 `host_only` 또는 `all_devices`이며 생략 시 `host_only`입니다.
- 응답 상태: `201 Created`

응답:

```json
{
  "code": "ABC234",
  "hostToken": "원본-호스트-토큰",
  "playbackMode": "all_devices",
  "expiresAt": 1789540800000
}
```

### `GET /api/rooms/:code`

유효하고 만료되지 않은 방의 공개 `RoomState`를 반환합니다. 토큰 해시와 내부 레코드 ID는 노출하지 않습니다. 단, UI 동기화와 매니저 표시에 필요한 참여자 ID 및 곡 ID는 공개 상태에 포함됩니다.

### `POST /api/rooms/:code/join`

요청:

```json
{ "nickname": "Alice" }
```

- 앞뒤 공백을 제거한 길이가 `2..20`이어야 합니다.
- 닉네임 중복은 허용됩니다.
- 첫 참여자는 자동으로 룸 매니저가 됩니다.
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

## 7. YouTube 조회

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

### `GET /api/youtube/charts/music`

- `CF-IPCountry`가 유효하면 해당 국가, 아니면 `YOUTUBE_DEFAULT_REGION`을 사용합니다.
- 해당 국가 차트가 없으면 기본 지역 차트로 폴백합니다.
- 결과는 지역별 30분간 캐시합니다.
- 최대 15개를 반환하며, 비임베드 영상도 `embeddable: false`로 표시할 수 있습니다.

```json
{
  "regionCode": "KR",
  "items": []
}
```

## 8. 신청곡과 재생 제어

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

필수 권한: controller

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

재생 위치는 서버가 `playbackPositionSeconds`와 `playbackAnchorAt`을 기준점으로 관리합니다. 재생 중인 클라이언트는 `serverTime`으로 서버 시계 오차를 추정하고 다음 위치를 계산합니다.

```text
position = playbackPositionSeconds
         + (serverNow - playbackAnchorAt) / 1000
```

`playbackRevision`은 곡 변경, 일시정지/재개, 호스트 전용 자동재생 차단 상태 변경 때 증가합니다.

### `PATCH /api/rooms/:code/playback/autoplay-blocked`

필수 헤더: `x-host-token`

```json
{ "blocked": true }
```

실제 YouTube IFrame을 가진 호스트만 보고할 수 있습니다. `blocked: true`이면 서버는 `playbackPaused`도 함께 `true`로 저장합니다.

이 전역 차단 상태는 `host_only` 모드에만 적용합니다. `all_devices` 모드의 자동재생 차단은 기기별 UI에서 해제하며 다른 기기의 재생을 멈추지 않습니다.

### `DELETE /api/rooms/:code/songs/:songId`

필수 권한: controller. `queued` 상태의 곡만 `removed`로 바꿀 수 있습니다. 현재 재생 곡 삭제는 지원하지 않습니다.

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

### `POST /api/rooms/:code/manager/transfer`

필수 헤더: 현재 매니저의 `x-participant-token`

```json
{ "targetParticipantId": "uuid" }
```

대상은 같은 방에 존재하고 현재 매니저와 다른 참여자여야 합니다.

## 9. Socket.IO 계약

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
  "message": "존재하지 않거나 만료된 방입니다."
}
```

구독 자체는 인증이 필요하지 않습니다. 성공하면 서버는 소켓을 `room:{CODE}` 채널에 넣고 즉시 현재 `room:state`를 한 번 보냅니다.

### 서버 → 클라이언트: `room:state`

payload는 전체 `RoomState`입니다. 참여, 곡 추가/이동/삭제, 재생 상태, 방 설정, 매니저 이전 후 해당 방의 모든 구독자에게 전달됩니다.

## 10. 오류 계약

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
| 요청 | `INVALID_JSON`, `INVALID_QUERY`, `INVALID_NICKNAME`, `INVALID_DIRECTION`, `INVALID_PLAYBACK_MODE`, `EMPTY_SETTINGS` |
| 인증/권한 | `PARTICIPANT_REQUIRED`, `MANAGER_FORBIDDEN`, `HOST_FORBIDDEN`, `CONTROL_FORBIDDEN` |
| 방/곡 | `ROOM_NOT_FOUND`, `DUPLICATE_SONG`, `SONG_NOT_FOUND`, `NO_CURRENT_SONG` |
| 설정/권한 이전 | `INVALID_HOST_VOLUME`, `PARTICIPANT_NOT_FOUND`, `ALREADY_MANAGER` |
| YouTube | `YOUTUBE_NOT_CONFIGURED`, `YOUTUBE_UNAVAILABLE`, `YOUTUBE_API_ERROR`, `INVALID_VIDEO`, `VIDEO_NOT_PLAYABLE` |
| 인프라 | `RATE_LIMITED`, `INTERNAL_ERROR` |

응답에는 `RateLimit-Limit`와 `RateLimit-Remaining` 헤더가 제한 대상 요청에 포함됩니다. 제한을 넘으면 HTTP 429와 `RATE_LIMITED`를 반환합니다.
