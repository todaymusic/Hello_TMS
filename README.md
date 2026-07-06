# TMS — 사내 업무 관리 플랫폼

슬랙형 사내 업무 관리 플랫폼. 진리원천은 [`SPEC.md`](./SPEC.md), 외관 레퍼런스는 [`PROTOTYPE.html`](./PROTOTYPE.html), 작업 지침은 [`CLAUDE.md`](./CLAUDE.md).

## 구조 (모노레포)
```
tms/
├─ apps/
│  ├─ web/    Next.js 16 (App Router) · TypeScript · Tailwind  ← 프론트
│  └─ api/    NestJS 11 · Prisma 7 · PostgreSQL  ← 백엔드 REST
├─ docker-compose.yml   PostgreSQL · Redis · Meilisearch (로컬 인프라)
├─ SPEC.md · PROTOTYPE.html · CLAUDE.md
```

## 실행
**프론트(웹):**
```bash
cd apps/web
npm run dev        # http://localhost:3000  → /dashboard 로 이동
```

**로컬 인프라(추후, Docker Desktop 설치 후):**
```bash
docker compose up -d   # postgres:5432 · redis:6379 · meilisearch:7700
```

## 진행 상황
- [x] Phase 1 — UI 쉘: 사이드바 + 대시보드(실시간 현황·업무 부여·상태 변경)
- [x] NestJS API · Prisma 7 DB 스키마 (8개 리소스 REST CRUD)
- [ ] 인증(NextAuth) · 실시간(Socket.IO) · 프론트 목업→API 연결
- [ ] Phase 2 — 프로젝트 / Phase 3 — 캘린더·검색 / Phase 4 — AI·내활동·근태
