# TMS API (`apps/api`)

NestJS + Prisma 7(드라이버 어댑터, `@prisma/adapter-pg`) 기반의 TMS 백엔드.

## 스택
- **NestJS 11** (REST, `/api` prefix, 글로벌 ValidationPipe)
- **Prisma 7** — datasource URL은 schema가 아니라 런타임 driver adapter로 주입 (`prisma.config.ts` + `PrismaService`)
- **PostgreSQL** (로컬 Docker 또는 Railway)
- 생성 클라이언트: `generated/prisma` (CJS, `moduleFormat = "cjs"`), git 미포함 → 빌드 시 `prisma generate`로 생성

## 로컬 실행
```bash
npm install
# .env 의 DATABASE_URL 을 PostgreSQL 연결문자열로 설정 (Railway URL 가능)
npm run prisma:migrate      # 테이블 생성 (DB 연결 필요)
npm run db:seed             # 샘플 데이터 (선택)
npm run start:dev           # http://localhost:4000/api
```
> DB 없이도 부팅·health 체크는 동작합니다. DB 쿼리 엔드포인트는 DB 연결 후 정상화됩니다.

## 헬스 체크
```
GET /api/health  →  { service, status: "ok", time }
```

## REST 엔드포인트 요약
| 리소스 | 경로 | 비고 |
|---|---|---|
| Users | `GET/POST /api/users`, `GET/PATCH/DELETE /api/users/:id` | |
| Projects | `GET/POST /api/projects`, `GET/PATCH/DELETE /api/projects/:id` | |
| Project 담당자 | `POST /api/projects/:id/owners`, `DELETE .../owners/:userId` | owner(역할별 책임자) |
| Project 참여자 | `POST /api/projects/:id/participants`, `DELETE .../participants/:userId` | participant(협업 멤버) |
| Tasks | `GET/POST /api/tasks`(필터: assigneeId·assignerId·projectId·category·status), `GET/PATCH/DELETE /api/tasks/:id` | |
| Task 시작/종료 | `POST /api/tasks/:id/start`, `POST /api/tasks/:id/end` | 체크리스트 연동·WorkLog 생성/마감 |
| Messages | `POST /api/messages`, `GET /api/messages?projectId=`, `POST /api/messages/:id/reactions`, `DELETE` | 멘션 시 알림 생성 |
| WorkLogs | `GET /api/worklogs?userId=&taskId=&date=`, `GET /api/worklogs/summary?userId=&date=` | |
| Attendance | `POST /api/attendance/check-in`, `POST /api/attendance/check-out`, `GET /api/attendance?userId=&month=` | |
| Leaves | `POST /api/leaves`, `GET /api/leaves?userId=&status=`, `PATCH /api/leaves/:id/status`, `DELETE` | |
| Notifications | `GET /api/notifications?userId=&unreadOnly=`, `PATCH /api/notifications/:id/read`, `PATCH /api/notifications/read-all?userId=`, `DELETE` | |

## Railway 배포
1. Railway에서 **새 서비스** 생성 → 이 레포 연결 → **Root Directory = `apps/api`** 설정.
2. **PostgreSQL 플러그인** 추가 → 자동 주입되는 `DATABASE_URL` 사용(혹은 직접 환경변수 설정).
3. 환경변수: `DATABASE_URL`(필수), `ANTHROPIC_API_KEY`(AI 기능 시), `PORT`는 Railway가 자동 주입.
4. `railway.json` 이 빌드/시작을 정의:
   - build: `npm run build` (= `prisma generate && nest build`)
   - start: `npx prisma db push; node dist/src/main` (스키마를 DB에 동기화 후 기동)
   - 초기 개발 단계라 마이그레이션 파일 대신 `db push` 사용. 스키마 안정화 후 `migrate` 전환 권장.

> ⚠️ todaymusic/ohhello와 **DB를 공유하지 말 것** — TMS 전용 PostgreSQL 서비스를 따로 둘 것.

## 환경변수 (`.env`)
```
DATABASE_URL="postgresql://USER:PASS@HOST:PORT/DB?schema=public"
REDIS_URL=...           # 추후 BullMQ/캐시
MEILI_HOST=...          # 추후 검색
ANTHROPIC_API_KEY=...   # 추후 AI(업무설명 doc·소통 요약)
PORT=4000
```

## 미구현(다음 단계)
- 인증(NextAuth/SSO 연동), Socket.IO 실시간(상태·메시지·알림·체크리스트)
- AI: 업무설명 doc 생성 / 프로젝트 소통 요약 (BullMQ 비동기 + Claude API)
- Meilisearch 검색, 프론트 목업 → API 연결
