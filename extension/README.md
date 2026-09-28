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

`npm run build`는 `https://bside.whitekw.com`을 사용하는 웹 스토어 업로드용 `extension/dist-store/`를 생성합니다. 이 빌드의 `manifest.json`에는 `key`가 없습니다. `dist-store/` **안의 파일들**을 ZIP 루트에 압축해 Chrome 웹 스토어에 업로드하세요. 기존 `dist-production/`과 이전 ZIP은 공개 키가 들어 있을 수 있으므로 업로드하지 마세요. 스토어에서 부여한 확장 프로그램 ID를 운영 서버의 `BROWSER_EXTENSION_IDS`에 추가하고 백엔드를 재시작해야 로그인할 수 있습니다.

Windows에서는 `extension/`에서 다음처럼 압축합니다. 스토어에 이미 같은 버전을 업로드했다면 먼저 `build.mjs`와 `package.json`의 버전을 올려야 합니다.

```powershell
Compress-Archive -Path .\dist-store\* -DestinationPath .\B-SIDE-Extension-Store-0.1.1.zip
```

GitHub 릴리즈 등에서 기존 고정 ID의 압축해제 설치본을 배포하려면 `npm run build:unpacked`를 실행하세요. 이 빌드는 `extension/dist-unpacked/`에 공개 키를 넣어 기존 ID **`bdobkhgdalimhnpgkhlbghgjafaapfgo`**를 유지합니다. 스토어 업로드용 ZIP과 섞지 마세요. 스토어가 부여한 ID가 이 ID와 다르면 `BROWSER_EXTENSION_IDS`에 두 ID를 쉼표로 구분해 등록할 수 있습니다. 개인 키 `production-signing.pem`은 Git에서 제외하고 안전하게 보관하세요.

운영 서버의 `DISCORD_REDIRECT_URI`와 Discord Developer Portal Redirect URI를 `https://bside.whitekw.com/api/auth/discord/callback`으로 맞추고, `AUTH_COOKIE_SECURE=true`를 설정합니다. 운영 주소가 HTTPS로 바뀌면 확장 프로그램도 다시 빌드해 설치하거나 스토어에 업데이트해야 합니다. Discord 비밀키와 YouTube API 키는 확장 프로그램에 넣지 않습니다.

확장 프로그램의 코드가 바뀌면 새 패키지를 빌드·배포해야 합니다. 서버 API 구현만 바뀌면 기존 확장 프로그램은 재설치할 필요가 없습니다.

## 인증 및 권한

`chrome.identity.launchWebAuthFlow`가 B-SIDE 서버의 Discord 로그인 흐름을 시작합니다. 서버는 등록된 확장 프로그램 ID와 OAuth state를 확인하고, 2분짜리 일회용 교환 코드를 돌려줍니다. 확장 프로그램은 PKCE 검증값으로 이를 교환해 30일짜리 B-SIDE 전용 토큰을 받습니다. 토큰 원본은 확장 프로그램 저장소에, 해시는 서버 SQLite에 저장합니다. 로그아웃하면 서버 토큰을 폐기합니다.

서버는 방 목록을 계정 멤버십으로 조회하고 곡 추가 때마다 멤버십을 다시 검사합니다. 우클릭한 YouTube URL에서 영상 ID만 읽으며, 영상 정보와 외부 재생 가능 여부는 기존 서버 YouTube API에서 검증합니다.
