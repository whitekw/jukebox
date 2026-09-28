# B-SIDE Chrome 확장 프로그램

YouTube의 영상 썸네일 또는 제목 링크를 우클릭해 `B-SIDE 대기열에 추가`를 선택합니다. Discord로 로그인한 B-SIDE 계정이 이미 참여한 방만 대상으로 표시합니다. 방이 여러 개면 확장 프로그램 아이콘의 팝업에서 추가할 방을 선택합니다. 익명 사용자는 사용할 수 없습니다.

## 로컬 개발

Node.js 24 이상에서 `extension/` 디렉터리의 `npm run build:local`을 실행합니다. `http://localhost:5173`을 사용하는 `extension/dist/`가 생성됩니다. Chrome의 `chrome://extensions`에서 개발자 모드를 켜고 **압축해제된 확장 프로그램 로드**로 `extension/dist/`를 선택합니다.

확장 프로그램 카드에 표시된 32자리 ID를 복사해 `backend/.env`에 설정하고 백엔드를 재시작합니다.

```dotenv
BROWSER_EXTENSION_IDS=확장_프로그램_ID
```

기존 Discord OAuth 설정(`DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`)도 필요합니다. 로컬에서는 `DISCORD_REDIRECT_URI=http://localhost:5173/api/auth/discord/callback`을 Discord Developer Portal에 등록하고 백엔드와 Vite 개발 서버를 실행합니다. 확장 프로그램 아이콘을 클릭해 **Discord로 연결**을 누른 뒤 B-SIDE 계정으로 방에 참여하면 됩니다. 로그인 창은 사용자가 버튼을 누를 때만 열립니다.

코드를 수정하면 다시 `npm run build:local`을 실행하고 `chrome://extensions`에서 확장 프로그램을 새로고침합니다. `npm test`는 영상 링크 판별, 우클릭 메뉴와 로그인·추가 흐름을 검증합니다.

로그인 팝업에 `Authorization page could not be loaded.`가 표시되면 먼저 확장 프로그램 카드의 ID가 `BROWSER_EXTENSION_IDS`와 정확히 같은지 확인하고, 백엔드를 재시작한 뒤 확장 프로그램도 새로고침하세요. 로컬 빌드의 `dist/config.js`가 `http://localhost:5173`을 가리키는지와 `DISCORD_REDIRECT_URI`가 로컬 주소인지도 확인합니다.

## 운영 빌드

`npm run build`는 `http://bside.whitekw.com`을 사용하는 `extension/dist-production/`을 생성합니다. 로컬 빌드인 `extension/dist/`는 유지됩니다. 운영 서버 환경 변수에도 운영 확장 프로그램의 ID를 `BROWSER_EXTENSION_IDS`에 넣고 재배포해야 로그인할 수 있습니다. 쉼표로 구분하면 개발용 ID와 배포용 ID를 함께 허용할 수 있습니다. Chrome 웹 스토어에 게시하면 스토어의 확장 프로그램 ID를 사용해야 합니다.

Chrome에서 `extension/dist-production/`을 별도로 로드하면 로컬 확장 프로그램과 ID가 달라질 수 있습니다. `chrome://extensions`에 표시된 운영 빌드의 ID를 확인해 Portainer에 등록하세요.

현재 운영 서버가 HTTP만 제공하므로 이 빌드도 HTTP로 통신합니다. 로그인 토큰과 API 요청이 네트워크에서 암호화되지 않으므로 HTTPS 적용 후 운영 주소를 다시 바꾸는 것이 좋습니다. 운영 서버의 `DISCORD_REDIRECT_URI`와 Discord Developer Portal Redirect URI를 `http://bside.whitekw.com/api/auth/discord/callback`으로 맞추고, `AUTH_COOKIE_SECURE=false`를 설정합니다. Discord 비밀키와 YouTube API 키는 확장 프로그램에 넣지 않습니다.

확장 프로그램의 코드가 바뀌면 새 패키지를 빌드·배포해야 합니다. 서버 API 구현만 바뀌면 기존 확장 프로그램은 재설치할 필요가 없습니다.

## 인증 및 권한

`chrome.identity.launchWebAuthFlow`가 B-SIDE 서버의 Discord 로그인 흐름을 시작합니다. 서버는 등록된 확장 프로그램 ID와 OAuth state를 확인하고, 2분짜리 일회용 교환 코드를 돌려줍니다. 확장 프로그램은 PKCE 검증값으로 이를 교환해 30일짜리 B-SIDE 전용 토큰을 받습니다. 토큰 원본은 확장 프로그램 저장소에, 해시는 서버 SQLite에 저장합니다. 로그아웃하면 서버 토큰을 폐기합니다.

서버는 방 목록을 계정 멤버십으로 조회하고 곡 추가 때마다 멤버십을 다시 검사합니다. 우클릭한 YouTube URL에서 영상 ID만 읽으며, 영상 정보와 외부 재생 가능 여부는 기존 서버 YouTube API에서 검증합니다.
