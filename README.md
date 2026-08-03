# Jukebox

한 기기에서 방을 호스트하고 참여자들이 휴대폰으로 신청곡을 추가하는 자가 호스팅 웹 서비스입니다.

## 현재 구현된 MVP

- 6자리 룸 코드와 QR 입장
- 가입 없는 닉네임 기반 참여
- 참여자별 활성 신청곡 수 제한
- YouTube 키워드 검색(최대 15개)
- 접속 국가별 YouTube 인기 음악 목록(외부 재생 가능 영상만 표시)
- YouTube, YouTube Music, `youtu.be`, Shorts URL 직접 추가
- 중복 영상과 임베드 불가 영상 차단
- 호스트 전용 건너뛰기, 순서 변경, 삭제
- YouTube 공식 IFrame Player 자동 재생 및 종료 후 다음 곡 처리
- Socket.IO 룸 단위 실시간 동기화
- SQLite 영속 저장과 만료 방 정리
- 호스트·참여자 토큰 해시 검증과 기본 요청 제한

## 구조

```text
frontend (React + Vite)
       │ HTTP / Socket.IO
       ▼
backend (Express)
       ├─ SQLite: rooms / participants / songs
       ├─ Socket.IO: 룸 상태 브로드캐스트
       └─ YouTube Data API: 검색 및 영상 검증
```

영상 스트림은 백엔드를 거치지 않고 호스트 브라우저가 YouTube 공식 플레이어에서 직접 재생합니다.

## 요구 사항

- Node.js 24 이상
- YouTube Data API v3 키

## 환경 설정

`backend/.env.example`을 `backend/.env`로 복사하고 값을 설정합니다.

```dotenv
PORT=3001
DATABASE_PATH=./data/jukebox.sqlite
ROOM_TTL_HOURS=24
YOUTUBE_API_KEY=your_api_key
YOUTUBE_DEFAULT_REGION=KR
TRUST_PROXY=false
```

리버스 프록시 뒤에서 운영한다면 실제 클라이언트 IP를 요청 제한에 사용하도록 `TRUST_PROXY=true`로 설정합니다.
Cloudflare의 `CF-IPCountry` 헤더가 없는 로컬 환경이나 국가별 차트를 제공하지 않는 지역에서는
`YOUTUBE_DEFAULT_REGION`의 국가 코드로 인기 음악을 표시합니다.

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

- 호스트 키와 참여자 키는 각 브라우저의 `localStorage`에 저장됩니다. 호스트 키를 잃으면 해당 방의 제어 권한을 복구할 수 없습니다.
- 현재 방은 기본 24시간 후 삭제됩니다.
- YouTube API 키는 반드시 백엔드 환경 변수에만 저장하며 프런트엔드에 넣지 않습니다.
- YouTube 플레이어 광고를 차단하거나 플레이어를 숨기지 않습니다.
- SQLite 파일이 유실되지 않도록 `backend/data`를 정기 백업하세요.
