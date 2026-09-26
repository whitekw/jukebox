# B-SIDE 데스크톱 앱

Windows용 Electron 앱입니다. 현재 운영 중인 B-SIDE 사이트를 앱 창에서 열므로 서버 연결이 필요합니다. 앱을 종료하면 채팅 알림도 멈춥니다.

## 실행과 설치 파일 만들기

Node.js 24 이상이 설치된 Windows에서:

```powershell
cd desktop
npm ci
npm start
```

Electron 실행 파일이 아직 내려받아지지 않았다면 처음 실행 시 자동으로 받습니다. 개발 서버를 사용하려면 실행 전에 `$env:BSIDE_APP_URL = 'http://localhost:5173'`을 설정하세요. 기본 주소는 `http://bside.whitekw.com`입니다.

설치 파일을 만들려면:

```powershell
npm run dist:win
```

결과물은 `desktop/release/B-SIDE-0.1.0-Setup-x64.exe`입니다. 이 폴더는 Git에 포함되지 않습니다.
현재 설치 파일은 코드 서명을 하지 않으므로 Windows에서 게시자 확인 경고가 나타날 수 있습니다.

변경 검증은 `npm test`와 `npm run test:smoke`로 실행합니다. 스모크 테스트는 숨긴 Electron 창에서 로컬 테스트 페이지와 데스크톱 브리지를 확인합니다.

## 채팅 알림

방에 참여한 상태에서 다른 사람이 채팅을 보내면, 앱 창이 비활성일 때 Windows 알림을 띄웁니다. 자신의 메시지와 시스템 활동 로그는 알리지 않습니다. 알림을 누르면 앱을 앞으로 가져오고 해당 방에 있으면 채팅창을 엽니다. 앱을 완전히 종료했을 때는 연결과 알림이 모두 중단됩니다.

알림 연결은 `frontend/` 코드에도 포함되어 있습니다. 운영 사이트에서 알림을 사용하려면 변경된 프론트엔드를 서버에 배포해야 합니다. 로컬에서 바로 시험하려면 백엔드와 프론트엔드 개발 서버를 실행하고 `BSIDE_APP_URL`을 `http://localhost:5173`으로 지정하세요.

현재 기본 사이트는 HTTP입니다. 로그인과 메시지가 네트워크에서 보호되도록 운영 시 HTTPS를 설정하고 `desktop/appUrl.cjs`의 기본 주소를 변경한 다음 앱을 다시 빌드하는 것이 좋습니다.
