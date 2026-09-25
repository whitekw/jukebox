# Jukebox

호스트 기기 또는 방에 참여한 모든 기기에서 음악을 재생하고, 참여자들이 신청곡을 추가하는 자가 호스팅 웹 서비스입니다.

## 현재 구현된 MVP

- 6자리 룸 코드와 QR 입장
- Discord OAuth2 로그인과 서버 세션
- 로그인 계정 소유 방 생성과 기기 간 복구
- 방 생성 시 호스트 전용 재생 또는 모든 기기 동기화 재생 선택
- 가입 없는 닉네임 기반 참여
- YouTube 키워드 검색(최대 15개)
- YouTube, YouTube Music, `youtu.be`, Shorts URL 직접 추가
- 중복 영상과 임베드 불가 영상 차단
- 공동 관리자의 재생·정지, 건너뛰기, 순서 변경, 삭제
- 관리자 추가·해제와 접속 해제 후에도 유지되는 관리자 권한
- YouTube 공식 IFrame Player 자동 재생 및 종료 후 다음 곡 처리
- Socket.IO 룸 단위 실시간 동기화
- 참여자 전용 실시간 방 채팅과 대기열 제어·재생·입퇴장·관리자 활동 로그
- SQLite 영속 저장과 사용자가 직접 삭제하기 전까지 유지되는 계정 소유 방
- 호스트·참여자 토큰 해시 검증과 기본 요청 제한

## 구조

```text
frontend (React + Vite)
       │ HTTP / Socket.IO
       ▼
backend (Express)
       ├─ SQLite: users / auth_sessions / rooms / participants / songs / room_feed_entries
       ├─ Socket.IO: 룸 상태·채팅 브로드캐스트
       ├─ Discord OAuth2: 계정 로그인
       └─ YouTube Data API: 검색 및 영상 검증
```

영상 스트림은 백엔드를 거치지 않습니다. 호스트 전용 모드에서는 호스트 브라우저만, 모든 기기 모드에서는 각 브라우저가 YouTube 공식 플레이어에서 직접 재생합니다.

상세한 프로젝트 분석, 시스템 아키텍처, API, 데이터 모델, 개발·운영 문서는
[`docs/README.md`](./docs/README.md)에서 확인할 수 있습니다.

## 요구 사항

- Node.js 24 이상
- YouTube Data API v3 키

## 환경 설정

`backend/.env.example`을 `backend/.env`로 복사하고 값을 설정합니다.

```dotenv
PORT=3001
DATABASE_PATH=./data/jukebox.sqlite
PARTICIPANT_LEAVE_GRACE_MS=5000
YOUTUBE_API_KEY=your_api_key
TRUST_PROXY=false
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
DISCORD_REDIRECT_URI=http://localhost:5173/api/auth/discord/callback
AUTH_SESSION_TTL_DAYS=30
AUTH_COOKIE_SECURE=false
```

리버스 프록시 뒤에서 운영한다면 실제 클라이언트 IP를 요청 제한에 사용하도록 `TRUST_PROXY=true`로 설정합니다.

Discord Developer Portal에서 OAuth2 Redirect URI를 `DISCORD_REDIRECT_URI`와 완전히 동일하게 등록해야 합니다. 운영 주소가 HTTPS라면 `AUTH_COOKIE_SECURE=true`를 사용합니다. 방 생성은 로그인이 필수이므로 세 Discord 환경 변수를 모두 설정해야 합니다. 로그인하지 않은 사용자도 기존 방에는 참여할 수 있습니다.

## 개발 실행

터미널 1:

```powershell
cd backend
npm install
npm run dev
```

터미널 2:

```powershell
cd frontend
npm install
npm run dev
```

브라우저에서 `http://localhost:5173`을 엽니다. Vite가 API와 WebSocket 요청을 `localhost:3001`로 프록시합니다.

## 프로덕션 실행

```powershell
cd frontend
npm ci
npm run build

cd ..\backend
npm ci
npm start
```

Express가 `frontend/dist`를 정적 파일로 제공하므로 외부에는 백엔드 포트 하나만 노출하면 됩니다. 실제 인터넷 공개 시에는 Caddy 또는 Nginx에서 HTTPS를 종료하고 Express로 프록시하세요. WebSocket 업그레이드도 허용해야 합니다.

## Docker로 테스트 서버 배포

먼저 `backend/.env.example`을 `backend/.env`로 복사하고 실제 `YOUTUBE_API_KEY`를 설정합니다. SQLite 경로와 포트는 Compose가 컨테이너용 값으로 덮어씁니다.

```bash
docker compose up -d --build
```

서버의 `3001` 포트를 방화벽에서 허용하고 아래 주소로 접속합니다.

```text
http://테스트서버-IP:3001
```

상태와 로그는 다음 명령으로 확인할 수 있습니다.

```bash
docker compose ps
docker compose logs -f jukebox
```

컨테이너를 중지하고 제거할 때는 다음 명령을 사용합니다.

```bash
docker compose down
```

SQLite 데이터는 `jukebox-data` 볼륨에 유지됩니다. `docker compose down -v`는 이 볼륨과 저장된 방·대기열 데이터를 함께 삭제하므로 데이터 삭제가 필요한 경우에만 사용하세요.

### tar 이미지로 배포

테스트 서버에 `jukebox-test.tar`, `compose.deploy.yaml`, `jukebox.env.example`을 복사합니다. 그다음 환경 파일을 만들고 실제 YouTube API 키를 입력합니다.

```bash
cp jukebox.env.example jukebox.env
```

이미지를 불러오고 Compose로 실행합니다.

```bash
docker load -i jukebox-test.tar
docker compose --env-file jukebox.env -f compose.deploy.yaml up -d
```

상태와 로그를 확인합니다.

```bash
docker compose --env-file jukebox.env -f compose.deploy.yaml ps
docker compose --env-file jukebox.env -f compose.deploy.yaml logs -f jukebox
```

업데이트할 때는 새 tar를 `docker load`한 뒤 같은 `up -d` 명령을 다시 실행하면 됩니다.

## 검증

```powershell
cd backend
npm test

cd ..\frontend
npm run lint
npm run build
```

## 중요한 운영 메모

- 호스트 키와 참여자 키는 각 브라우저의 `localStorage`에 저장됩니다. 방 소유자는 다른 기기에서 재생 호스트를 다시 지정할 수 있으며, 이때 기존 호스트 키는 폐기됩니다.
- Discord 로그인 세션 원본은 `HttpOnly` 쿠키로만 전달하고 SQLite에는 SHA-256 해시만 저장합니다. Discord 액세스·리프레시 토큰은 저장하지 않습니다.
- 새로 생성한 방은 소유자가 직접 삭제하기 전까지 유지됩니다.
- YouTube API 키는 반드시 백엔드 환경 변수에만 저장하며 프런트엔드에 넣지 않습니다.
- YouTube 플레이어 광고를 차단하거나 플레이어를 숨기지 않습니다.
- SQLite 파일이 유실되지 않도록 `backend/data`를 정기 백업하세요.
