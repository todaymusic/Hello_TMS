import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

function todayMidnight() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  /** 출근 — 오늘 레코드 upsert, checkIn 최초 1회만 기록 */
  async checkIn(userId: string) {
    const date = todayMidnight();
    const now = new Date();
    const existing = await this.prisma.attendance.findUnique({
      where: { userId_date: { userId, date } },
    });
    if (existing?.checkIn) return existing;

    return this.prisma.attendance.upsert({
      where: { userId_date: { userId, date } },
      create: { userId, date, checkIn: now },
      update: { checkIn: now },
    });
  }

  /** 퇴근 — 오늘 레코드 checkOut 기록 */
  async checkOut(userId: string) {
    const date = todayMidnight();
    const existing = await this.prisma.attendance.findUnique({
      where: { userId_date: { userId, date } },
    });
    if (!existing)
      throw new BadRequestException('출근 기록이 없어 퇴근 처리할 수 없습니다');

    return this.prisma.attendance.update({
      where: { userId_date: { userId, date } },
      data: { checkOut: new Date() },
    });
  }

  /** 사용자 근태 목록 (month=YYYY-MM 으로 월 필터) */
  findByUser(userId: string, month?: string) {
    let dateRange: { gte: Date; lt: Date } | undefined;
    if (month) {
      const [y, m] = month.split('-').map(Number);
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 1);
      dateRange = { gte: start, lt: end };
    }
    return this.prisma.attendance.findMany({
      where: { userId, date: dateRange },
      orderBy: { date: 'desc' },
    });
  }
}
