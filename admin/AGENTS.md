# 운영 대시보드 작업 규칙

`admin/`은 사용자용 `frontend/`와 별도로 빌드하지만 같은 저장소·Express API·Discord 로그인 세션을 사용한다. `frontend/AGENTS.md`의 폴더 책임, API 분리, 비동기 정리, 접근성, 검증 원칙을 따른다.

- `src/app/`은 라우트와 최상위 조립, `src/features/admin/`은 운영 화면·API·타입·훅, `src/shared/`는 HTTP와 범용 포맷만 담당한다.
- 화면은 Tailwind CSS와 CLI가 생성한 shadcn/ui 컴포넌트를 사용한다. 기본 neutral 색상·토큰을 유지하고 별도 테마나 일회용 디자인 시스템을 만들지 않는다. UI 컴포넌트를 추가할 때는 `npx shadcn@latest add <component>`를 사용한다.
- 운영 권한은 서버의 `ADMIN_DISCORD_IDS` 허용 목록과 `/api/admin/*` 검사에서 결정한다. 화면에서 버튼이나 경로를 숨기는 것만으로 권한을 구현하지 않는다. 운영 변경 요청은 감사 기록을 남긴다.
- 관리자 API 호출은 `features/admin/api.ts`와 `shared/http.ts`에 모은다. 조회에는 취소 가능한 요청을 사용하고, 변경 뒤에는 서버 응답을 다시 조회한다.
- 컴포넌트는 `PascalCase.tsx`, 훅은 `useSomething.ts`, 타입과 순수 로직은 `.ts`를 사용한다. feature 외 코드에는 상대 경로 import를 우선한다. shadcn 생성 컴포넌트는 CLI가 만든 별칭 import를 유지한다.
- 변경 후 `npm run build`, `npm run lint`, 관련 백엔드 테스트와 데스크톱·좁은 화면을 확인한다.
