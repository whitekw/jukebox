# Jukebox 기술 문서

이 디렉터리는 소스 코드와 배포 설정을 기준으로 정리한 프로젝트 기술 문서입니다.

> 기준일: 2026-09-16  
> 기준 범위: `frontend/src`, `backend/src`, 테스트, Docker/Compose, GitHub Actions

## 문서 목록

| 문서 | 내용 |
| --- | --- |
| [PROJECT_ANALYSIS.md](./PROJECT_ANALYSIS.md) | 제품 목적, 사용자 흐름, 기술 스택, 코드 구조, 현재 제약과 개선 우선순위 |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 시스템 경계, 컴포넌트, 상태 소유권, 핵심 시퀀스, 권한·보안·확장 구조 |
| [API.md](./API.md) | REST API, 인증 헤더, Socket.IO 이벤트, 오류 및 요청 제한 계약 |
| [DATA_MODEL.md](./DATA_MODEL.md) | SQLite 스키마, 관계, 상태 전이, 무결성 규칙과 마이그레이션 방식 |
| [OPERATIONS.md](./OPERATIONS.md) | 로컬 개발, 환경 변수, 빌드·테스트, Docker 배포, 운영 점검 사항 |

## 빠른 구조 파악

```text
통합 룸 화면: /room/:code
├─ 모든 사용자: 닉네임 입장, 검색/신청, 모든 기기 모드 재생
└─ 호스트 토큰 추가 보유자: QR/룸 코드, 재생·대기열·방 설정 제어
        │
        ├─ REST: 명령과 최초 상태 조회
        └─ Socket.IO: 변경된 RoomState와 기준 재생 타임라인 수신
                │
                ▼
Express + Room Service
├─ SQLite: 방, 참여자, 신청곡 및 재생 제어 상태
└─ YouTube Data API v3: 검색, 영상 검증
```

새 기능을 추가할 때는 다음 문서도 함께 갱신합니다.

- 엔드포인트나 이벤트가 바뀌면 `API.md`
- 테이블, 상태 또는 도메인 불변식이 바뀌면 `DATA_MODEL.md`
- 컴포넌트 경계나 상태 소유권이 바뀌면 `ARCHITECTURE.md`
- 환경 변수, 실행 또는 배포 방식이 바뀌면 `OPERATIONS.md`
