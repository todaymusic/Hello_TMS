import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WorkLogsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(filters: { userId?: string; taskId?: string; date?: string }) {
    let dateRange: { gte: Date; lt: Date } | undefined;
    if (filters.date) {
      const start = new Date(filters.date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      dateRange = { gte: start, lt: end };
    }

    return this.prisma.workLog.findMany({
      where: {
        userId: filters.userId,
        taskId: filters.taskId,
        startedAt: dateRange,
      },
      include: {
        task: { select: { id: true, title: true, category: true } },
        user: { select: { id: true, name: true, avatarColor: true } },
      },
      orderBy: { startedAt: 'desc' },
    });
  }

  /** 특정 사용자의 하루 근무 요약 (총 작업 시간 분 단위) */
  async dailySummary(userId: string, date: string) {
    const logs = await this.findAll({ userId, date });
    const totalMinutes = logs.reduce((sum, log) => {
      const end = log.endedAt ?? new Date();
      return sum + (end.getTime() - log.startedAt.getTime()) / 60000;
    }, 0);
    return {
      userId,
      date,
      count: logs.length,
      totalMinutes: Math.round(totalMinutes),
      logs,
    };
  }
}
