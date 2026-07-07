import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TaskStatus } from '../../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { PushService } from '../push/push.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { EndTaskDto } from './dto/end-task.dto';
import { QueryTaskDto } from './dto/query-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

const taskInclude = {
  assigner: { select: { id: true, name: true, avatarColor: true } },
  assignee: { select: { id: true, name: true, avatarColor: true } },
  project: { select: { id: true, name: true } },
} as const;

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly push: PushService,
  ) {}

  /** 완료 검수: AI 평가 생성(캐시) — 요청자가 검수창 열 때 */
  async aiReview(id: string) {
    const t = await this.findOne(id);
    const r = await this.ai.evaluateTaskCompletion({
      title: t.title,
      description: t.description,
      aiDescriptionDoc: t.aiDescriptionDoc,
      statusMemo: t.statusMemo,
      reportLink: t.reportLink,
      videoLink: t.videoLink,
      progress: t.progress,
    });
    await this.prisma.task.update({
      where: { id },
      data: { aiReview: r.evaluation },
    });
    return r; // { evaluation, grade(추천) }
  }

  /** 재작업 요청 — reworkCount++, 사유 저장, 다시 진행, 담당자 알림 */
  async rework(id: string, reason: string) {
    const t = await this.findOne(id);
    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        reworkCount: { increment: 1 },
        reworkReason: reason,
        status: TaskStatus.doing,
        endedAt: null,
        grade: null,
      },
      include: taskInclude,
    });
    if (t.assigneeId) {
      const content = `🔁 «${t.title}» 재작업 요청(#${updated.reworkCount}) — 사유: ${reason}`;
      await this.prisma.notification.create({
        data: { userId: t.assigneeId, type: 'task', content, link: '/activity' },
      });
      await this.push.sendToUser(t.assigneeId, { title: 'TMS 알림', body: content, url: '/activity' });
    }
    return updated;
  }

  /** 승인 + 등급 부여 — status done 유지, 담당자 알림 */
  async approve(id: string, grade: string) {
    const t = await this.findOne(id);
    const updated = await this.prisma.task.update({
      where: { id },
      data: { grade, status: TaskStatus.done },
      include: taskInclude,
    });
    if (t.assigneeId) {
      const content = `🏅 «${t.title}» 업무가 승인됐어요 — 등급: ${grade}`;
      await this.prisma.notification.create({
        data: { userId: t.assigneeId, type: 'task', content, link: '/activity' },
      });
      await this.push.sendToUser(t.assigneeId, { title: 'TMS 알림', body: content, url: '/activity' });
    }
    return updated;
  }

  create(dto: CreateTaskDto) {
    const { dueDate, ...rest } = dto;
    return this.prisma.task.create({
      data: {
        ...rest,
        dueDate: dueDate ? new Date(dueDate) : undefined,
      },
      include: taskInclude,
    });
  }

  findAll(query: QueryTaskDto) {
    return this.prisma.task.findMany({
      where: {
        assigneeId: query.assigneeId,
        assignerId: query.assignerId,
        projectId: query.projectId,
        category: query.category,
        status: query.status,
      },
      include: taskInclude,
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: { ...taskInclude, workLogs: true },
    });
    if (!task) throw new NotFoundException(`Task ${id} not found`);
    return task;
  }

  async update(id: string, dto: UpdateTaskDto) {
    await this.findOne(id);
    const { dueDate, plannedDate, ...rest } = dto;
    return this.prisma.task.update({
      where: { id },
      data: {
        ...rest,
        ...(dueDate !== undefined
          ? { dueDate: dueDate ? new Date(dueDate) : null }
          : {}),
        ...(plannedDate !== undefined
          ? { plannedDate: plannedDate ? new Date(plannedDate) : null }
          : {}),
      },
      include: taskInclude,
    });
  }

  // 하드삭제 — 지우기 전에 TaskDeletion 로그에 스냅샷 저장(누가·언제·복구용).
  async remove(id: string, actorId?: string) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('업무를 찾을 수 없습니다.');
    let deletedByName: string | null = null;
    if (actorId) {
      const u = await this.prisma.user.findUnique({
        where: { id: actorId },
        select: { name: true },
      });
      deletedByName = u?.name ?? null;
    }
    await this.prisma.taskDeletion.create({
      data: {
        taskId: task.id,
        title: task.title,
        snapshot: JSON.parse(JSON.stringify(task)),
        deletedById: actorId ?? null,
        deletedByName,
      },
    });
    return this.prisma.task.delete({ where: { id } });
  }

  // 삭제 기록 목록(최근순) — 관리자 '삭제 기록' 화면용.
  listDeletions() {
    return this.prisma.taskDeletion.findMany({
      orderBy: { deletedAt: 'desc' },
      take: 300,
    });
  }

  // 삭제 기록에서 업무 복구 — 스냅샷으로 원래 id 그대로 재생성 후 로그 제거.
  async restoreDeletion(deletionId: string) {
    const log = await this.prisma.taskDeletion.findUnique({
      where: { id: deletionId },
    });
    if (!log) throw new NotFoundException('삭제 기록을 찾을 수 없습니다.');
    const snap = { ...(log.snapshot as Record<string, unknown>) };
    const [assigner, assignee, project] = await Promise.all([
      snap.assignerId
        ? this.prisma.user.findUnique({ where: { id: String(snap.assignerId) }, select: { id: true } })
        : null,
      snap.assigneeId
        ? this.prisma.user.findUnique({ where: { id: String(snap.assigneeId) }, select: { id: true } })
        : null,
      snap.projectId
        ? this.prisma.project.findUnique({ where: { id: String(snap.projectId) }, select: { id: true } })
        : null,
    ]);
    if (!assigner) snap.assignerId = null;
    if (!assignee) snap.assigneeId = null;
    if (!project) snap.projectId = null;
    delete snap.updatedAt;
    const restored = await this.prisma.task.create({ data: snap as never });
    await this.prisma.taskDeletion.delete({ where: { id: deletionId } });
    return restored;
  }

  /**
   * 업무 시작 — 내 활동 체크리스트 체크 시.
   * startedAt 기록, status=doing, 열린 WorkLog 생성(대시보드/근무로그 연동).
   */
  /** 요청받은 업무 수락 — acceptedAt 기록, 요청자에게 알림 */
  async accept(id: string) {
    const task = await this.findOne(id);
    const now = new Date();
    const updated = await this.prisma.task.update({
      where: { id },
      data: { acceptedAt: task.acceptedAt ?? now },
      include: taskInclude,
    });
    if (task.assignerId && task.assignerId !== task.assigneeId) {
      const content = `${updated.assignee?.name ?? '담당자'}님이 «${task.title}» 업무를 수락했습니다`;
      await this.prisma.notification.create({
        data: { userId: task.assignerId, type: 'task', content, link: '/activity' },
      });
      await this.push.sendToUser(task.assignerId, { title: 'TMS 알림', body: content, url: '/activity' });
    }
    return updated;
  }

  /** 요청받은 업무 미수락(반려) — status=rejected, 사유 기록, 부여자에게 반려 대기 알림 */
  async reject(id: string, reason: string) {
    const task = await this.findOne(id);
    const now = new Date();
    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        status: TaskStatus.rejected,
        rejectedAt: now,
        rejectReason: reason,
        acceptedAt: null,
      },
      include: taskInclude,
    });
    if (task.assignerId && task.assignerId !== task.assigneeId) {
      const content = `${updated.assignee?.name ?? '담당자'}님이 «${task.title}» 업무를 미수락했어요 — 사유: ${reason}`;
      await this.prisma.notification.create({
        data: { userId: task.assignerId, type: 'task', content, link: '/dashboard' },
      });
      await this.push.sendToUser(task.assignerId, { title: 'TMS 알림', body: content, url: '/dashboard' });
    }
    return updated;
  }

  /** 반려된 업무 재요청 — 부여자가 다시 수락 요청, status=todo로 초기화, 담당자에게 알림 */
  async requestAgain(id: string) {
    const task = await this.findOne(id);
    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        status: TaskStatus.todo,
        rejectedAt: null,
        rejectReason: null,
        acceptedAt: null,
      },
      include: taskInclude,
    });
    if (task.assigneeId && task.assignerId !== task.assigneeId) {
      const content = `«${task.title}» 업무 수락을 다시 요청했어요`;
      await this.prisma.notification.create({
        data: { userId: task.assigneeId, type: 'task', content, link: '/activity' },
      });
      await this.push.sendToUser(task.assigneeId, { title: 'TMS 알림', body: content, url: '/activity' });
    }
    return updated;
  }

  async start(id: string) {
    const task = await this.findOne(id);
    if (!task.assigneeId)
      throw new BadRequestException('수행자(assignee)가 지정되지 않은 업무는 시작할 수 없습니다');
    // 남이 요청한 업무는 수락해야 시작 가능
    if (task.assignerId && task.assignerId !== task.assigneeId && !task.acceptedAt)
      throw new BadRequestException('먼저 업무를 수락해주세요');

    const now = new Date();
    const [updated] = await this.prisma.$transaction([
      this.prisma.task.update({
        where: { id },
        data: {
          status: TaskStatus.doing,
          startedAt: task.startedAt ?? now,
          pauseReason: null,
          pausedAt: null,
        },
        include: taskInclude,
      }),
      this.prisma.workLog.create({
        data: { userId: task.assigneeId, taskId: id, startedAt: now },
      }),
      // 업무를 시작/재개하면 '퇴근' 상태 해제 + 접속 갱신
      this.prisma.user.update({
        where: { id: task.assigneeId },
        data: { clockedOut: false, lastSeenAt: now },
      }),
    ]);
    return updated;
  }

  // 한국시간(KST=UTC+9) 오늘 0시의 UTC 순간
  private kstDayStart(now: Date): Date {
    const kst = new Date(now.getTime() + 9 * 3600_000);
    kst.setUTCHours(0, 0, 0, 0);
    return new Date(kst.getTime() - 9 * 3600_000);
  }

  // 열린 WorkLog를 '시작한 날의 근무종료(workEnd, 없으면 18:00)'로 닫아 밤샘 시간 과다집계 방지
  private kstWorkEnd(startedAt: Date, workEnd?: string | null): Date {
    const [hRaw, mRaw] = (workEnd ?? '18:00').split(':');
    const h = parseInt(hRaw, 10);
    const m = parseInt(mRaw, 10);
    const kst = new Date(startedAt.getTime() + 9 * 3600_000);
    kst.setUTCHours(Number.isFinite(h) ? h : 18, Number.isFinite(m) ? m : 0, 0, 0);
    const cap = new Date(kst.getTime() - 9 * 3600_000);
    return cap > startedAt ? cap : startedAt;
  }

  /**
   * 하루 경계 리셋 — 전날 시작해서 아직 '진행중(doing)'인 내 업무를 자동으로 '중단(paused)'으로 내린다.
   * (퇴근/종료를 안 누르고 탭만 닫아도 다음날 '현재 업무중'에 남지 않게 → 앱 진입 시 호출)
   * 열린 WorkLog는 시작일 근무종료시각으로 닫는다. 오늘 시작해 진행중인 건 그대로 둔다.
   */
  async dayReset(userId: string) {
    if (!userId) return { reset: 0 };
    const todayStart = this.kstDayStart(new Date());
    // 내가 수행자인 doing 업무의, 오늘(KST) 이전에 시작된 '열린' 세션들
    const staleLogs = await this.prisma.workLog.findMany({
      where: {
        userId,
        endedAt: null,
        startedAt: { lt: todayStart },
        task: { is: { assigneeId: userId, status: TaskStatus.doing } },
      },
      select: { id: true, taskId: true, startedAt: true },
    });
    if (staleLogs.length === 0) return { reset: 0 };

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { workEnd: true },
    });
    const taskIds = [
      ...new Set(
        staleLogs
          .map((l) => l.taskId)
          .filter((x): x is string => !!x),
      ),
    ];
    await this.prisma.$transaction([
      ...staleLogs.map((l) =>
        this.prisma.workLog.update({
          where: { id: l.id },
          data: { endedAt: this.kstWorkEnd(l.startedAt, user?.workEnd) },
        }),
      ),
      this.prisma.task.updateMany({
        where: { id: { in: taskIds }, assigneeId: userId, status: TaskStatus.doing },
        data: { status: TaskStatus.paused },
      }),
    ]);
    return { reset: taskIds.length };
  }

  /**
   * 업무 중단 — 잠시 멈춤. 열린 WorkLog 닫고 status=paused (시간 기록 남김).
   */
  async pause(id: string, reason?: string) {
    await this.findOne(id);
    const now = new Date();
    const r = reason?.trim();
    await this.prisma.workLog.updateMany({
      where: { taskId: id, endedAt: null },
      data: { endedAt: now, ...(r ? { note: `⏸ ${r}` } : {}) },
    });
    return this.prisma.task.update({
      where: { id },
      data: { status: TaskStatus.paused, pauseReason: r || null, pausedAt: now },
      include: taskInclude,
    });
  }

  /**
   * 업무 재개 — 중단했던 업무 다시. 새 WorkLog 세션 시작, status=doing.
   */
  async resume(id: string) {
    const task = await this.findOne(id);
    if (!task.assigneeId)
      throw new BadRequestException('수행자가 지정되지 않은 업무는 재개할 수 없습니다');
    const now = new Date();
    const [updated] = await this.prisma.$transaction([
      this.prisma.task.update({
        where: { id },
        data: { status: TaskStatus.doing, pauseReason: null, pausedAt: null },
        include: taskInclude,
      }),
      this.prisma.workLog.create({
        data: { userId: task.assigneeId, taskId: id, startedAt: now },
      }),
      // 업무를 시작/재개하면 '퇴근' 상태 해제 + 접속 갱신
      this.prisma.user.update({
        where: { id: task.assigneeId },
        data: { clockedOut: false, lastSeenAt: now },
      }),
    ]);
    return updated;
  }

  /**
   * 업무 종료 — 체크리스트 종료 시.
   * endedAt 기록, progress=100, status=done, 산출물 링크 저장, 열린 WorkLog 닫기.
   */
  async end(id: string, dto: EndTaskDto) {
    const task = await this.findOne(id);
    const now = new Date();
    // 남이 부여한 업무는 완료 즉시 done이 아니라 검수 대기(completed_pending)로 → 부여자가 검수/등급.
    // 스스로 만든 업무는 검수자가 없으므로 바로 done.
    const needsReview = !!task.assignerId && task.assignerId !== task.assigneeId;

    const closed = await this.prisma.workLog.updateMany({
      where: { taskId: id, endedAt: null },
      data: { endedAt: now, note: dto.note },
    });
    // 시작(진행중) 없이 바로 완료한 경우: 닫을 열린 세션이 없어 완료 메모가 유실됨.
    // → 완료 메모가 있으면 즉시 완료 세션(startedAt=endedAt)을 만들어 메모를 보존한다.
    if (closed.count === 0 && dto.note?.trim() && task.assigneeId) {
      await this.prisma.workLog.create({
        data: { userId: task.assigneeId, taskId: id, startedAt: now, endedAt: now, note: dto.note },
      });
    }

    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        status: needsReview ? TaskStatus.completed_pending : TaskStatus.done,
        endedAt: now,
        progress: 100,
        pauseReason: null,
        pausedAt: null,
        ...(dto.reportLink !== undefined ? { reportLink: dto.reportLink } : {}),
        ...(dto.videoLink !== undefined ? { videoLink: dto.videoLink } : {}),
      },
      include: taskInclude,
    });
    // 요청자에게 완료(검수 요청) 알림
    if (needsReview && task.assignerId) {
      const content = `✅ ${updated.assignee?.name ?? '담당자'}님이 «${task.title}» 업무를 완료했습니다 — 검수해주세요`;
      await this.prisma.notification.create({
        data: { userId: task.assignerId, type: 'task', content, link: '/dashboard' },
      });
      await this.push.sendToUser(task.assignerId, { title: 'TMS 알림', body: content, url: '/dashboard' });
    }
    return updated;
  }
}
