import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

function dayStart(date: string) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

@Injectable()
export class ScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string, date: string) {
    const d = dayStart(date);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    return this.prisma.scheduleBlock.findMany({
      where: { userId, date: { gte: d, lt: next } },
      include: {
        task: { select: { id: true, title: true, priority: true, status: true } },
      },
      orderBy: { startMin: 'asc' },
    });
  }

  create(dto: {
    userId: string;
    date: string;
    taskId?: string;
    label?: string;
    startMin: number;
    endMin: number;
  }) {
    return this.prisma.scheduleBlock.create({
      data: {
        userId: dto.userId,
        date: dayStart(dto.date),
        taskId: dto.taskId,
        label: dto.label,
        startMin: dto.startMin,
        endMin: dto.endMin,
      },
      include: {
        task: { select: { id: true, title: true, priority: true, status: true } },
      },
    });
  }

  update(id: string, dto: { startMin?: number; endMin?: number }) {
    return this.prisma.scheduleBlock.update({
      where: { id },
      data: { startMin: dto.startMin, endMin: dto.endMin },
      include: {
        task: { select: { id: true, title: true, priority: true, status: true } },
      },
    });
  }

  remove(id: string) {
    return this.prisma.scheduleBlock.delete({ where: { id } });
  }
}
