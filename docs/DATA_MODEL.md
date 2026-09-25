# 데이터 모델

## 1. 개요

데이터는 Node.js 내장 `node:sqlite`의 동기 API로 관리합니다. 파일 DB에는 WAL 모드를, 테스트용 `:memory:` DB에는 기본 저널 모드를 사용하며 모든 연결에서 foreign key 검사를 활성화합니다.

```mermaid
erDiagram
    USERS ||--o{ AUTH_SESSIONS : owns
    ROOMS ||--o{ PARTICIPANTS : contains
    ROOMS ||--o{ SONGS : owns
    ROOMS ||--o{ ROOM_FEED_ENTRIES : owns
    PARTICIPANTS ||--o{ SONGS : requests
    PARTICIPANTS o|--o{ ROOM_FEED_ENTRIES : acts

    USERS {
        text id PK
        text discord_id UK
        text username
        text global_name
        text avatar_hash
        integer created_at
        integer updated_at
        integer last_login_at
    }

    AUTH_SESSIONS {
        text id PK
        text user_id FK
        text token_hash UK
        integer created_at
        integer expires_at
    }

    ROOMS {
        text id PK
        text code UK
        text host_token_hash
        text owner_user_id FK
        integer host_volume
        text playback_mode
        integer playback_paused
        integer playback_blocked
        real playback_position_seconds
        integer playback_anchor_at
        integer playback_pending
        integer playback_revision
        text current_song_id
        integer created_at
    }

    PARTICIPANTS {
        text id PK
        text room_id FK
        text token_hash
        text nickname
        text user_id FK
        text profile_source
        text avatar_url
        integer left_at
        integer offline_since
        integer is_manager
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

    ROOM_FEED_ENTRIES {
        integer sequence PK
        text id UK
        text room_id FK
        text entry_type
        text participant_id FK "nullable"
        text nickname
        text actor_type
        text content
        text event_type
        text event_data
        integer created_at
    }
```

`rooms.current_song_id`는 논리적 참조이지만 현재 스키마에는 foreign key 제약이 선언되어 있지 않습니다.

## 2. `users`와 `auth_sessions`

`users`는 Discord `identify` 응답의 최소 프로필만 저장합니다. `discord_id`는 UNIQUE이며 재로그인 시 `username`, `global_name`, `avatar_hash`, `updated_at`, `last_login_at`을 갱신합니다. 이메일과 OAuth 액세스·리프레시 토큰은 저장하지 않습니다.

`auth_sessions`는 사용자별 로그인 세션입니다. 브라우저에 전달한 32바이트 랜덤 원본 토큰은 저장하지 않고 SHA-256 hex인 `token_hash`만 저장합니다. `user_id`는 `users.id`를 참조하며 사용자 삭제 시 cascade됩니다. `expires_at`이 지난 세션은 인증에 사용할 수 없고 서버 시작 및 1분 정리 주기에 삭제됩니다.

인덱스는 `auth_sessions_by_user(user_id)`, `auth_sessions_by_expiry(expires_at)`을 사용합니다.

## 3. `rooms`

| 컬럼 | 타입/제약 | 의미 |
| --- | --- | --- |
| `id` | TEXT PK | 내부 UUID |
| `code` | TEXT NOT NULL UNIQUE | 사용자에게 노출하는 6자리 방 코드 |
| `host_token_hash` | TEXT NOT NULL | `host_only`는 원본 토큰의 SHA-256 hex, `all_devices`는 빈 문자열 |
| `owner_user_id` | TEXT nullable FK → `users.id`, ON DELETE SET NULL | 로그인한 생성 계정. 생성 시 필수 |
| `host_volume` | INTEGER, 기본 100, `0..100` | 호스트 IFrame 플레이어 볼륨 |
| `playback_mode` | TEXT, 기본 `host_only` | `host_only` 또는 `all_devices` |
| `playback_paused` | INTEGER, 기본 0, `0/1` | 논리적 일시정지 상태 |
| `playback_blocked` | INTEGER, 기본 0, `0/1` | 호스트 브라우저 자동재생 차단 상태 |
| `playback_position_seconds` | REAL, 기본 0, 0 이상 | 기준 시각에서의 재생 위치 |
| `playback_anchor_at` | INTEGER, 기본 0 | 기준 위치가 유효한 서버 epoch ms |
| `playback_pending` | INTEGER, 기본 0, `0/1` | 실제 플레이어의 재생 시작을 기다리는 상태 |
| `playback_revision` | INTEGER, 기본 0 | 타임라인 변경 순번 |
| `current_song_id` | TEXT nullable | 현재 곡 ID |
| `created_at` | INTEGER NOT NULL | 생성 epoch ms |

인덱스:

- `rooms.code`의 UNIQUE 인덱스
- `rooms_by_owner(owner_user_id)`

## 4. `participants`

| 컬럼 | 타입/제약 | 의미 |
| --- | --- | --- |
| `id` | TEXT PK | 참여자 UUID |
| `room_id` | TEXT FK → `rooms.id`, ON DELETE CASCADE | 소속 방 |
| `token_hash` | TEXT NOT NULL | 참여자 원본 토큰의 SHA-256 hex |
| `nickname` | TEXT NOT NULL | 표시 이름, 서비스 규칙상 공백 제거 후 `1..20`자 |
| `user_id` | TEXT nullable FK → `users.id` | 로그인 계정의 방 멤버십. 익명 참여자는 null |
| `profile_source` | TEXT | `account` 또는 `custom` |
| `avatar_url` | TEXT nullable | 계정 참여자의 프로필 이미지 스냅샷 |
| `offline_since` | INTEGER nullable | 마지막 연결이 끊긴 시각 epoch ms. 재접속하면 null |
| `is_manager` | INTEGER, 기본 0, `0/1` | 공동 관리자 여부 |
| `left_at` | INTEGER nullable | 계정 멤버가 방을 나간 시각. 곡·채팅 기록 보존을 위해 행은 유지 |
| `created_at` | INTEGER NOT NULL | 참여 시각 epoch ms |

제약과 인덱스:

- `UNIQUE(room_id, token_hash)`
- `participants_by_room(room_id)`
- `active_members_by_room(room_id, user_id)` partial UNIQUE (`user_id IS NOT NULL AND left_at IS NULL`)
- 같은 방의 닉네임 중복은 허용합니다.

`participant_access_tokens`는 로그인 멤버가 다른 기기에서 다시 들어올 때 발급한 참여 토큰 해시를 보관합니다. 한 참여자당 최근 16개까지만 유지하며, 방 나가기로 모두 폐기합니다. 로그인 멤버 토큰은 해당 계정의 세션과 함께 검증합니다. 온라인 상태는 Socket.IO 연결로 판단하며, `offline_since`는 신청자가 떠난 곡의 제어 권한을 1분 뒤 열기 위한 시각입니다. 서버 재시작 시 연결이 모두 끊기므로 활성 참여자의 시각을 재시작 시점으로 초기화합니다. 오프라인 멤버는 참여자 목록에 남고 익명 참여자는 온라인일 때만 표시합니다.
## 5. `songs`

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

## 6. `room_feed_entries`

| 컬럼 | 타입/제약 | 의미 |
| --- | --- | --- |
| `sequence` | INTEGER PK AUTOINCREMENT | 채팅과 활동 로그를 함께 정렬하는 전역 순번 |
| `id` | TEXT NOT NULL UNIQUE | 피드 항목 UUID |
| `room_id` | TEXT FK → `rooms.id`, ON DELETE CASCADE | 소속 방 |
| `entry_type` | TEXT CHECK | `message` 또는 `system` |
| `participant_id` | TEXT nullable FK → `participants.id`, ON DELETE SET NULL | 메시지 작성자 또는 동작 수행 참여자 |
| `nickname` | TEXT nullable | 로그가 생성될 당시 참여자 닉네임 스냅샷 |
| `actor_type` | TEXT CHECK | `participant`, `host`, `system` |
| `content` | TEXT nullable | 사용자 메시지 본문 |
| `event_type` | TEXT nullable | 구조화된 방 활동 종류 |
| `event_data` | TEXT nullable | 곡명, 대상 참여자, 이동 위치 등의 JSON |
| `created_at` | INTEGER NOT NULL | 생성 시각 epoch ms |

`room_feed_entries_by_room_sequence(room_id, sequence)` 인덱스를 사용합니다. 입장·퇴장 로그를 제외한 최신 100개를 선택한 뒤 `sequence` 오름차순으로 반환합니다. `sequence`는 일반 메시지와 시스템 로그에 공통으로 발급되므로 같은 밀리초에 생성되어도 순서가 보존됩니다.

시스템 로그 종류는 건너뛰기·대기열 삭제·순서 변경, 전체 일시정지·재개, 관리자 지정·해제입니다. 입장·퇴장과 곡 추가는 새 활동 로그를 만들지 않습니다. 표시 문장은 DB에 저장하지 않고 `event_type`과 `event_data`를 프런트에서 현재 언어에 맞게 번역합니다.


## 7. 곡 상태 전이

```mermaid
stateDiagram-v2
    [*] --> current: 현재 곡 없음
    [*] --> queued: 현재 곡 있음
    queued --> current: advance에서 대기열 선두 선택
    queued --> removed: controller·신청자·자리를 비운 신청자의 곡에 대한 참여자가 삭제
    current --> played: controller·신청자·자리를 비운 신청자의 곡에 대한 참여자의 advance 또는 재생 종료
    played --> [*]
    removed --> [*]
```

- 첫 신청곡은 `current`, 이후 신청곡은 `queued`입니다.
- `advance`는 기존 `current`를 `played`로 바꾸고 `position`, `created_at` 순서상 첫 `queued`를 `current`로 바꿉니다.
- 현재 구현은 `played`와 `removed` 행을 방이 삭제될 때까지 유지합니다.
- 대기열 이동은 두 인접 곡의 `position`을 교환합니다. 중간 충돌을 피하기 위해 이동 곡에 임시 음수 값을 넣습니다.

## 8. 핵심 불변식

### 계정과 로그인

- Discord 로그인은 `identify` 범위만 요청합니다.
- OAuth state와 세션 쿠키는 HttpOnly, SameSite=Lax이며 운영 HTTPS에서는 Secure를 사용합니다.
- 원본 로그인 세션 토큰과 Discord OAuth 토큰은 DB에 저장하지 않습니다.
- OAuth `returnTo`는 같은 출처의 절대 경로만 허용합니다.
- 로그인 사용자가 만든 방은 `owner_user_id`로 계정에 연결되며, 소유자는 기기가 바뀌어도 controller 권한을 가집니다.
- 새 방은 로그인한 사용자만 생성하며 모두 계정 소유 방으로 저장합니다.
- `host_only` 방에서 소유자가 재생 호스트를 다시 지정하면 `host_token_hash`를 교체하여 기존 호스트 토큰을 폐기합니다. `all_devices` 방에는 호스트 토큰을 발급하지 않습니다.

### 방

- 코드 문자는 혼동하기 쉬운 `I`, `O`, `0`, `1`을 제외한 알파벳/숫자 집합에서 생성합니다.
- 방은 소유자가 직접 삭제할 때까지 유지됩니다.
- 방 생성 시 로그인한 생성자가 매니저가 되며, 관리자 권한은 로그인 참여자에게만 지정할 수 있습니다. 관리자는 다른 로그인 참여자의 관리자 상태를 추가하거나 해제할 수 있습니다.
- 관리자가 없거나 오프라인이어도 다른 참여자에게 권한을 자동으로 넘기지 않습니다. 방 소유자는 관리자 여부와 관계없이 방을 제어할 수 있습니다.
- 재생 모드는 방 생성 시 `host_only` 또는 `all_devices`로 고정됩니다.
- 재생 중 예상 위치는 기준 위치에 `현재 서버 시각 - playback_anchor_at`을 더해 계산합니다.

### 참여자와 권한

- 원본 토큰은 저장하지 않고 해시만 저장합니다.
- 참여자 토큰은 해당 방의 참여자 한 명과 매칭되어야 합니다.
- 매니저 작업은 참여자의 `is_manager`가 1이어야 합니다.
- controller 작업은 `host_only` 방의 올바른 호스트 토큰, 관리자 토큰 또는 방 소유자 로그인 세션 중 하나가 필요합니다.
- 일반 참여자는 `songs.added_by`가 자신의 ID인 현재 곡을 건너뛰거나 대기 곡을 삭제할 수 있습니다.
- 신청자가 명시적으로 방을 나갔다면 즉시, 마지막 연결이 끊긴 뒤 1분이 지났다면 다른 참여자도 그 곡을 건너뛰거나 대기열에서 삭제할 수 있습니다. 재접속하면 이 권한은 다시 닫힙니다.

### 신청곡

- 한 방에는 같은 `video_id`의 활성 곡이 둘 이상 존재할 수 없습니다.
- 직접 추가되는 영상은 YouTube 조회 시 공개·비라이브·임베드 가능 상태여야 합니다.
- 대기열 조회는 `position ASC, created_at ASC`로 안정적으로 정렬합니다.

### 채팅

- 유효한 참여자 토큰이 있는 사용자만 기록을 조회하거나 메시지를 전송할 수 있습니다.
- 메시지는 일반 텍스트로 저장하며 앞뒤 공백을 제거한 뒤 `1..300`자를 검증합니다.
- 사용자 메시지와 시스템 활동 로그는 하나의 증가 순번을 공유합니다.
- 로그의 참여자가 사라져도 당시 닉네임 스냅샷과 로그 내용은 유지합니다.
- 삭제 기능은 제공하지 않습니다. 채팅 전송은 계정 또는 참여자 토큰 기준 분당 30회로 제한합니다.

## 9. 트랜잭션 경계

`rooms.js`의 다음 변경은 `BEGIN IMMEDIATE` / `COMMIT`으로 처리되고 실패 시 `ROLLBACK`됩니다.

- 참여
- 곡 추가
- 다음 곡 전환
- 재생/자동재생 차단 상태 변경
- 곡 삭제 및 순서 변경
- 방 설정 변경
- 매니저 추가·해제
- 채팅 메시지 추가
- 시스템 활동 로그 추가
- Discord 사용자 upsert와 로그인 세션 생성

`BEGIN IMMEDIATE`는 쓰기 예약 잠금을 먼저 획득하므로 한도 및 중복 검사 뒤 삽입 사이의 동시 쓰기 경쟁을 줄입니다. 현재 모든 DB 작업은 단일 Node.js 프로세스 안에서 동기 실행됩니다.

## 10. 스키마 초기화와 삭제

`createDatabase()`는 빈 DB에 현재 스키마를 생성하고 SQLite `user_version`을 `1`로 설정합니다. 이후 같은 버전의 DB를 다시 열 수 있습니다. 이전 스키마는 마이그레이션하지 않으며, 서버는 명확한 초기화 오류와 함께 시작을 중단합니다. 기존 DB를 사용 중이라면 중지 후 DB 파일 또는 Docker 볼륨을 초기화해야 합니다.

방은 로그인 계정에 귀속되며 자동 삭제하지 않습니다. 방 삭제 시 foreign key cascade로 참여자, 곡, 채팅 피드를 함께 삭제합니다. 참여자 온라인 상태는 Socket.IO 연결을 기준으로 메모리에서 관리하고, 마지막 소켓 종료 후 `PARTICIPANT_LEAVE_GRACE_MS`가 지나면 오프라인으로 표시합니다. 로그인 세션은 기본 30일 뒤 만료되며 만료 시 자동 연장하지 않습니다.

## 11. 백업 고려사항

파일 DB는 WAL 모드이므로 실행 중 파일 복사만으로 백업할 때는 본 DB와 `-wal`, `-shm`의 일관성을 고려해야 합니다. 운영 백업은 SQLite의 일관된 백업 방식 또는 서비스를 안전하게 중지한 뒤 볼륨을 복제하는 방식이 적합합니다. 복원 전에는 현재 DB 볼륨의 별도 사본을 보관하고, 복원 후 `/api/health`와 방 생성/조회 동작을 확인합니다.
