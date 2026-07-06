# TMS — 사내 업무 관리 플랫폼

## 프로젝트 개요
- 슬랙형 사이드바 + 메인 영역 레이아웃의 사내 업무 관리 플랫폼.
- 핵심 탭: 대시보드 / 캘린더 / 프로젝트 / 내 활동.
- 콘텐츠 제작팀 워크플로우 기반(롱·쇼츠·프로젝트 단위 업무).

## 참고 파일 (Source of Truth)
- `SPEC.md` — 기능/데이터 모델/요구사항의 **단일 기준 문서**. 모든 동작은 여기를 따른다.
- `PROTOTYPE.html` — **시각·UX 레퍼런스** (정적 목업). 레이아웃·색·인터랙션 톤을 여기서 가져오되, 실제 로직은 SPEC.md를 따른다.
> 충돌 시 우선순위: SPEC.md(기능) > PROTOTYPE.html(외관). 새 기능이 추가되면 SPEC.md를 먼저 갱신한 뒤 구현한다.

## 기술 스택 (SPEC 3장 기준 — 풀스택 확정)
- 프론트: Next.js 15 (App Router) · TypeScript · Tailwind CSS · shadcn/ui · Zustand · TanStack Query · Tiptap
- 실시간: Socket.IO (상태·메시지·알림·체크리스트 시작/종료 동기화)
- 백엔드: NestJS · REST + WebSocket Gateway · BullMQ (AI 작업 큐)
- DB/스토리지: PostgreSQL · Redis · S3 호환
- AI: Claude API (대화 요약, 간략 메모→업무설명 doc 생성)
- 검색: Meilisearch
- 인증: NextAuth.js + SSO

## 핵심 도메인 규칙 (반드시 준수)
- **업무 대분류는 3종**: `long`(롱) / `shorts`(쇼츠) / `project`(프로젝트).
  - 롱·쇼츠 → 대시보드 [업무 부여]에서 직접 생성.
  - 프로젝트 → 대시보드에서 직접 생성 불가. **프로젝트 탭에서 먼저 생성·설정** 후 담당자/참여자 추가.
- **산출물 요구(taskType)는 별개 축**: `report` / `video` / `both` / `none`. 대분류와 조합 가능.
- 프로젝트 인원은 **담당자(owners, 역할별 책임자)** 와 **참여자(participants, 협업 멤버)** 로 구분.
- 진행률(progress)은 경과별 색상 코딩: 0%⚪ / ~25%🔴 / ~50%🟠 / ~75%🟡 / ~99%🔵 / 100%🟢.
- 내 활동 최상단 체크리스트: 체크=대시보드 즉시 시작+시작시각 기록, 종료=종료시각 기록+산출물 입력 폼.

## 용어 (항상 이 표기 사용)
- 담당자 = owner, 참여자 = participant (서로 혼용 금지)
- 대분류 = category, 산출물 요구 = taskType
- 부여자 = assigner, 담당자(태스크 수행) = assignee

## 구현 순서 (SPEC 6장 로드맵)
1. 인증 + UI 쉘(사이드바/탭 라우팅)
2. 대시보드(실시간 현황·업무 부여·상태) + Task CRUD(category/taskType 포함)
3. 프로젝트(생성 마법사·담당자/참여자·스레드·칸반)
4. 캘린더 + 검색 / AI(요약·업무설명 doc) + 내 활동·근태

## 작업 규칙
- 한 번에 한 기능씩, 끝까지 동작 검증 후 다음으로.
- UI는 PROTOTYPE.html의 디자인 토큰(색/타이포/간격)을 shadcn/ui + Tailwind로 재현.
- DB 스키마는 SPEC 4장 데이터 모델을 그대로 따른다.
- 모르는 결정은 추측하지 말고 SPEC.md를 인용해 질문할 것.
