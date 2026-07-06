/**
 * TMS 시드 데이터 — DB 연결 후 `npm run db:seed` 실행.
 * 샘플 사용자 / 프로젝트(담당자·참여자) / 업무(롱·쇼츠·프로젝트) / 근태·알림.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Seeding TMS...');

  // ───────── 사용자 ─────────
  const [hana, jisoo, minho, yuna] = await Promise.all([
    prisma.user.upsert({
      where: { email: 'hana@tms.dev' },
      update: {},
      create: {
        email: 'hana@tms.dev',
        name: '김하나',
        dept: '콘텐츠팀',
        role: '팀장',
        avatarColor: '#4f46e5',
        status: 'on',
        statusMessage: '롱폼 기획 중',
      },
    }),
    prisma.user.upsert({
      where: { email: 'jisoo@tms.dev' },
      update: {},
      create: {
        email: 'jisoo@tms.dev',
        name: '박지수',
        dept: '디자인팀',
        role: '디자이너',
        avatarColor: '#db2777',
        status: 'away',
      },
    }),
    prisma.user.upsert({
      where: { email: 'minho@tms.dev' },
      update: {},
      create: {
        email: 'minho@tms.dev',
        name: '이민호',
        dept: '개발팀',
        role: '개발자',
        avatarColor: '#0891b2',
        status: 'dnd',
      },
    }),
    prisma.user.upsert({
      where: { email: 'yuna@tms.dev' },
      update: {},
      create: {
        email: 'yuna@tms.dev',
        name: '최유나',
        dept: '마케팅팀',
        role: '마케터',
        avatarColor: '#16a34a',
        status: 'off',
      },
    }),
  ]);

  // ───────── 프로젝트 ─────────
  const project = await prisma.project.create({
    data: {
      name: '2026 브랜드 리뉴얼 캠페인',
      overview: '신규 브랜드 아이덴티티 영상·콘텐츠 제작',
      description:
        '브랜드 리뉴얼에 맞춘 롱폼 1편 + 쇼츠 5편 + 마케팅 소재 제작 협업 프로젝트.',
      startDate: new Date('2026-06-01'),
      endDate: new Date('2026-08-31'),
      status: 'active',
      progress: 35,
      links: [
        { label: '기획서', url: 'https://example.com/brief' },
        { label: '에셋 드라이브', url: 'https://example.com/assets' },
      ],
      owners: {
        create: [
          { userId: hana.id, role: 'lead' },
          { userId: jisoo.id, role: 'design' },
        ],
      },
      participants: {
        create: [{ userId: minho.id }, { userId: yuna.id }],
      },
    },
  });

  // ───────── 업무 ─────────
  await prisma.task.createMany({
    data: [
      {
        title: '브랜드 리뉴얼 롱폼 기획안',
        category: 'long',
        subCategory: '기획',
        priority: 'high',
        status: 'doing',
        reportRequired: true,
        videoRequired: false,
        description: '롱폼 1편 구성/스토리보드',
        dueDate: new Date('2026-07-10'),
        progress: 60,
        assignerId: hana.id,
        assigneeId: hana.id,
        projectId: project.id,
      },
      {
        title: '인스타 쇼츠 #1 편집',
        category: 'shorts',
        subCategory: '디자인',
        priority: 'medium',
        status: 'todo',
        reportRequired: false,
        videoRequired: true,
        dueDate: new Date('2026-07-05'),
        assignerId: hana.id,
        assigneeId: jisoo.id,
        projectId: project.id,
      },
      {
        title: '랜딩페이지 개발',
        category: 'project',
        subCategory: '개발',
        priority: 'urgent',
        status: 'doing',
        reportRequired: true,
        videoRequired: false,
        reportLink: 'https://example.com/landing-spec',
        dueDate: new Date('2026-07-20'),
        progress: 25,
        assignerId: hana.id,
        assigneeId: minho.id,
        projectId: project.id,
      },
      {
        title: '캠페인 SNS 광고 집행',
        category: 'project',
        subCategory: '마케팅',
        priority: 'medium',
        status: 'todo',
        reportRequired: true,
        videoRequired: false,
        dueDate: new Date('2026-08-01'),
        assignerId: hana.id,
        assigneeId: yuna.id,
        projectId: project.id,
      },
      {
        title: '단독 쇼츠: 신메뉴 소개',
        category: 'shorts',
        subCategory: '지점업무',
        priority: 'low',
        status: 'done',
        reportRequired: false,
        videoRequired: true,
        videoLink: 'https://example.com/shorts-menu',
        progress: 100,
        startedAt: new Date('2026-06-20T01:00:00Z'),
        endedAt: new Date('2026-06-20T03:30:00Z'),
        assignerId: hana.id,
        assigneeId: jisoo.id,
      },
    ],
  });

  // ───────── 근태 / 휴가 / 알림 ─────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  await prisma.attendance.upsert({
    where: { userId_date: { userId: hana.id, date: today } },
    update: {},
    create: {
      userId: hana.id,
      date: today,
      checkIn: new Date(today.getTime() + 9 * 3600 * 1000),
    },
  });

  await prisma.leave.create({
    data: {
      userId: minho.id,
      type: 'annual',
      startDate: new Date('2026-07-15'),
      endDate: new Date('2026-07-16'),
      reason: '개인 사유',
      status: 'requested',
    },
  });

  await prisma.notification.create({
    data: {
      userId: jisoo.id,
      type: 'task',
      content: '김하나님이 «인스타 쇼츠 #1 편집» 업무를 부여했습니다',
      link: `/projects/${project.id}`,
    },
  });

  console.log('✅ Seed complete:', {
    users: 4,
    project: project.name,
    tasks: 5,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
