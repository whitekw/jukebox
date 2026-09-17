# 데이터 모델

## 1. 개요

데이터는 Node.js 내장 `node:sqlite`의 동기 API로 관리합니다. 파일 DB에는 WAL 모드를, 테스트용 `:memory:` DB에는 기본 저널 모드를 사용하며 모든 연결에서 foreign key 검사를 활성화합니다.

```mermaid
erDiagram
    ROOMS ||--o{ PARTICIPANTS : contains
    ROOMS ||--o{ SONGS : owns
    PARTICIPANTS ||--o{ SONGS : requests

    ROOMS {
        text id PK
        text code UK
        text host_token_hash
        integer max_songs_per_participant
        text manager_participant_id
        integer host_volume
        text playback_mode
        integer playback_paused
        integer playback_blocked
        real playback_position_seconds
        integer playback_anchor_at
        integer playback_pending
        integer playback_revision
        text current_song_id
        integer empty_since
        integer created_at
        integer expires_at
    }

    PARTICIPANTS {
        text id PK
        text room_id FK
        text token_hash
        text nickname
        integer created_at
    }

    SONGS {
        text id PK
        text room_id FK
        text video_id
        text title
        text artist
        integer duration_seconds
        text thumbnail_url
        text added_by FK
        text status
        integer position
        integer created_at
    }
```

`rooms.manager_participant_id`와 `rooms.current_song_id`는 논리적 참조이지만 현재 스키마에는 foreign key 제약이 선언되어 있지 않습니다.

## 2. `rooms`

| 컬럼 | 타입/제약 | 의미 |
| --- | --- | --- |
| `id` | TEXT PK | 내부 UUID |
| `code` | TEXT NOT NULL UNIQUE | 사용자에게 노출하는 6자리 방 코드 |
| `host_token_hash` | TEXT NOT NULL | 호스트 원본 토큰의 SHA-256 hex |
| `max_songs_per_participant` | INTEGER NOT NULL, 기본 2 | 이전 버전 호환을 위해 남겨둔 미사용 컬럼 |
| `manager_participant_id` | TEXT nullable | 현재 매니저 참여자 ID |
| `host_volume` | INTEGER, 기본 100, `0..100` | 호스트 IFrame 플레이어 볼륨 |
| `playback_mode` | TEXT, 기본 `host_only` | `host_only` 또는 `all_devices` |
| `playback_paused` | INTEGER, 기본 0, `0/1` | 논리적 일시정지 상태 |
| `playback_blocked` | INTEGER, 기본 0, `0/1` | 호스트 브라우저 자동재생 차단 상태 |
| `playback_position_seconds` | REAL, 기본 0, 0 이상 | 기준 시각에서의 재생 위치 |
| `playback_anchor_at` | INTEGER, 기본 0 | 기준 위치가 유효한 서버 epoch ms |
| `playback_pending` | INTEGER, 기본 0, `0/1` | 실제 플레이어의 재생 시작을 기다리는 상태 |
| `playback_revision` | INTEGER, 기본 0 | 타임라인 변경 순번 |
| `current_song_id` | TEXT nullable | 현재 곡 ID |
| `empty_since` | INTEGER nullable | 인증된 Socket.IO 연결이 0개가 된 서버 epoch ms |
| `created_at` | INTEGER NOT NULL | 생성 epoch ms |
| `expires_at` | INTEGER NOT NULL | 만료 epoch ms |

인덱스:

- `rooms.code`의 UNIQUE 인덱스
- `rooms_by_expiry(expires_at)`
- `rooms_by_empty_since(empty_since)`

## 3. `participants`

| 컬럼 | 타입/제약 | 의미 |
| --- | --- | --- |
| `id` | TEXT PK | 참여자 UUID |
| `room_id` | TEXT FK → `rooms.id`, ON DELETE CASCADE | 소속 방 |
| `token_hash` | TEXT NOT NULL | 참여자 원본 토큰의 SHA-256 hex |
| `nickname` | TEXT NOT NULL | 표시 이름, 서비스 규칙상 공백 제거 후 `2..20`자 |
| `created_at` | INTEGER NOT NULL | 참여 시각 epoch ms |

제약과 인덱스:

- `UNIQUE(room_id, token_hash)`
- `participants_by_room(room_id)`
- 같은 방의 닉네임 중복은 허용합니다.

## 4. `songs`

| 컬럼 | 타입/제약 | 의미 |
| --- | --- | --- |
| `id` | TEXT PK | 곡 요청 UUID |
| `room_id` | TEXT FK → `rooms.id`, ON DELETE CASCADE | 소속 방 |
| `video_id` | TEXT NOT NULL | YouTube 영상 ID |
| `title` | TEXT NOT NULL | 추가 당시 YouTube 제목 스냅샷 |
| `artist` | TEXT NOT NULL | 추가 당시 채널명 스냅샷 |
| `duration_seconds` | INTEGER NOT NULL | 영상 길이(초) |
| `thumbnail_url` | TEXT NOT NULL | 추가 당시 썸네일 URL |
| `added_by` | TEXT FK → `participants.id`, ON DELETE CASCADE | 신청 참여자 |
| `status` | TEXT CHECK | `queued`, `current`, `played`, `removed` 중 하나 |
| `position` | INTEGER NOT NULL | 대기열 순서 값, 현재 곡은 0 |
| `created_at` | INTEGER NOT NULL | 신청 시각 epoch ms |

인덱스:

- `songs_by_room_status_position(room_id, status, position)`
- `active_video_per_room(room_id, video_id)` partial UNIQUE, 대상 상태는 `queued`, `current`

부분 UNIQUE 인덱스가 애플리케이션의 사전 중복 검사와 별개로 활성 곡 중복을 DB 수준에서도 방지합니다. 이미 `played` 또는 `removed`인 영상은 같은 방에 다시 추가할 수 있습니다.

## 5. 곡 상태 전이

```mermaid
stateDiagram-v2
    [*] --> current: 현재 곡 없음
    [*] --> queued: 현재 곡 있음
    queued --> current: advance에서 대기열 선두 선택
    queued --> removed: controller 또는 신청자가 삭제
    current --> played: controller·신청자의 advance 또는 재생 종료
    played --> [*]
    removed --> [*]
```

- 첫 신청곡은 `current`, 이후 신청곡은 `queued`입니다.
- `advance`는 기존 `current`를 `played`로 바꾸고 `position`, `created_at` 순서상 첫 `queued`를 `current`로 바꿉니다.
- 현재 구현은 `played`와 `removed` 행을 방이 만료될 때까지 유지합니다.
- 대기열 이동은 두 인접 곡의 `position`을 교환합니다. 중간 충돌을 피하기 위해 이동 곡에 임시 음수 값을 넣습니다.

## 6. 핵심 불변식

### 방

- 코드 문자는 혼동하기 쉬운 `I`, `O`, `0`, `1`을 제외한 알파벳/숫자 집합에서 생성합니다.
- 만료된 방은 조회·변경할 수 없습니다.
- 첫 참여자가 매니저가 되며 이후 명시적 이전으로만 바뀝니다.
- 재생 모드는 방 생성 시 `host_only` 또는 `all_devices`로 고정됩니다.
- 재생 중 예상 위치는 기준 위치에 `현재 서버 시각 - playback_anchor_at`을 더해 계산합니다.

### 참여자와 권한

- 원본 토큰은 저장하지 않고 해시만 저장합니다.
- 참여자 토큰은 해당 방의 참여자 한 명과 매칭되어야 합니다.
- 매니저 작업은 참여자 ID가 `manager_participant_id`와 같아야 합니다.
- controller 작업은 올바른 호스트 토큰 또는 현재 매니저 토큰 중 하나가 필요합니다.
- 일반 참여자는 `songs.added_by`가 자신의 ID인 현재 곡을 건너뛰거나 대기 곡을 삭제할 수 있습니다.

### 신청곡

- 한 방에는 같은 `video_id`의 활성 곡이 둘 이상 존재할 수 없습니다.
- 직접 추가되는 영상은 YouTube 조회 시 공개·비라이브·임베드 가능 상태여야 합니다.
- 대기열 조회는 `position ASC, created_at ASC`로 안정적으로 정렬합니다.

## 7. 트랜잭션 경계

`rooms.js`의 다음 변경은 `BEGIN IMMEDIATE` / `COMMIT`으로 처리되고 실패 시 `ROLLBACK`됩니다.

- 참여
- 곡 추가
- 다음 곡 전환
- 재생/자동재생 차단 상태 변경
- 곡 삭제 및 순서 변경
- 방 설정 변경
- 매니저 이전

`BEGIN IMMEDIATE`는 쓰기 예약 잠금을 먼저 획득하므로 한도 및 중복 검사 뒤 삽입 사이의 동시 쓰기 경쟁을 줄입니다. 현재 모든 DB 작업은 단일 Node.js 프로세스 안에서 동기 실행됩니다.

## 8. 스키마 초기화와 마이그레이션

`createDatabase()`는 시작할 때 `CREATE TABLE IF NOT EXISTS`와 인덱스 생성을 실행합니다. 기존 DB에 다음 `rooms` 컬럼이 없으면 `ALTER TABLE`로 추가합니다.

- `manager_participant_id`
- `host_volume`
- `playback_paused`
- `playback_blocked`
- `playback_mode`
- `playback_position_seconds`
- `playback_anchor_at`
- `playback_pending`
- `playback_revision`
- `empty_since`

그 뒤 매니저가 없는 기존 방에는 생성 시각이 가장 빠른 참여자를 매니저로 채웁니다. 현재 별도의 스키마 버전 테이블이나 마이그레이션 파일은 없습니다.

## 9. 만료와 삭제

- 방 생성 시 `expires_at = now + ROOM_TTL_HOURS`로 고정합니다.
- 유효한 호스트 또는 참여자 토큰으로 연결된 Socket.IO 클라이언트가 하나도 없으면 `empty_since`를 기록하고, 다시 연결되면 비웁니다.
- 서버 시작 시 모든 방을 빈 상태로 표시하며, 재연결된 방은 삭제 대상에서 제외합니다.
- 서버 시작 시와 이후 1분마다 `expires_at <= now`이거나 `empty_since + EMPTY_ROOM_TTL_HOURS <= now`인 방을 삭제합니다.
- 방 삭제는 foreign key cascade로 참여자와 곡을 함께 삭제합니다.
- 방 활동에 따른 TTL 연장 기능은 없습니다.

## 10. 백업 고려사항

파일 DB는 WAL 모드이므로 실행 중 파일 복사만으로 백업할 때는 본 DB와 `-wal`, `-shm`의 일관성을 고려해야 합니다. 운영 백업은 SQLite의 일관된 백업 방식 또는 서비스를 안전하게 중지한 뒤 볼륨을 복제하는 방식이 적합합니다. 복원 전에는 현재 DB 볼륨의 별도 사본을 보관하고, 복원 후 `/api/health`와 방 생성/조회 동작을 확인합니다.
