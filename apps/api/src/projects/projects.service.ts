import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { ProjectRole } from '../../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { AddOwnerDto, AddParticipantDto } from './dto/member.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

const memberSelect = {
  user: { select: { id: true, name: true, avatarColor: true, dept: true } },
} as const;

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateProjectDto) {
    const { startDate, endDate, links, ...rest } = dto;
    return this.prisma.project.create({
      data: {
        ...rest,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        links: links as unknown as Prisma.InputJsonValue,
      },
    });
  }

  // 진행률 = 완료 태스크 비율 (태스크 보드 기준 자동 산출)
  private calcProgress(tasks: { status: string }[]): number {
    if (!tasks.length) return 0;
    const done = tasks.filter(
      (t) => t.status === 'done' || t.status === 'completed_pending',
    ).length;
    return Math.round((done / tasks.length) * 100);
  }

  async findAll() {
    const projects = await this.prisma.project.findMany({
      include: {
        owners: { include: memberSelect },
        participants: { include: memberSelect },
        _count: { select: { tasks: true, messages: true } },
        tasks: { select: { status: true } },
      },
      orderBy: { createdAt: 'asc' }, // 기본: 오래된 순 (프론트에서 아카이브만 최근순 재정렬)
    });
    return projects.map(({ tasks, ...p }) => ({
      ...p,
      progress: this.calcProgress(tasks),
    }));
  }

  async findOne(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        owners: { include: memberSelect },
        participants: { include: memberSelect },
        tasks: {
          include: {
            assignee: { select: { id: true, name: true, avatarColor: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!project) throw new NotFoundException(`Project ${id} not found`);
    return { ...project, progress: this.calcProgress(project.tasks) };
  }

  async update(id: string, dto: UpdateProjectDto) {
    await this.ensureExists(id);
    const { startDate, endDate, links, reportNotes, ...rest } = dto;
    return this.prisma.project.update({
      where: { id },
      data: {
        ...rest,
        ...(startDate !== undefined
          ? { startDate: startDate ? new Date(startDate) : null }
          : {}),
        ...(endDate !== undefined
          ? { endDate: endDate ? new Date(endDate) : null }
          : {}),
        ...(links !== undefined
          ? { links: links as unknown as Prisma.InputJsonValue }
          : {}),
        ...(reportNotes !== undefined
          ? { reportNotes: reportNotes as unknown as Prisma.InputJsonValue }
          : {}),
      },
    });
  }

  async remove(id: string) {
    await this.ensureExists(id);
    // 프로젝트 삭제 시 소속 업무도 함께 삭제 (관련 스케줄=Cascade / 워크로그=SetNull).
    // owners·participants·messages는 스키마 onDelete: Cascade로 프로젝트 삭제 시 자동 삭제.
    return this.prisma.$transaction(async (tx) => {
      await tx.task.deleteMany({ where: { projectId: id } });
      return tx.project.delete({ where: { id } });
    });
  }

  // ───────── 담당자(owner) ─────────
  async addOwner(projectId: string, dto: AddOwnerDto) {
    await this.ensureExists(projectId);
    return this.prisma.projectOwner.upsert({
      where: { projectId_userId: { projectId, userId: dto.userId } },
      create: {
        projectId,
        userId: dto.userId,
        role: dto.role ?? ProjectRole.etc,
      },
      update: { role: dto.role ?? ProjectRole.etc },
      include: memberSelect,
    });
  }

  async removeOwner(projectId: string, userId: string) {
    await this.ensureExists(projectId);
    return this.prisma.projectOwner.delete({
      where: { projectId_userId: { projectId, userId } },
    });
  }

  // ───────── 참여자(participant) ─────────
  async addParticipant(projectId: string, dto: AddParticipantDto) {
    await this.ensureExists(projectId);
    return this.prisma.projectParticipant.upsert({
      where: { projectId_userId: { projectId, userId: dto.userId } },
      create: { projectId, userId: dto.userId },
      update: {},
      include: memberSelect,
    });
  }

  async removeParticipant(projectId: string, userId: string) {
    await this.ensureExists(projectId);
    return this.prisma.projectParticipant.delete({
      where: { projectId_userId: { projectId, userId } },
    });
  }

  private async ensureExists(id: string) {
    const exists = await this.prisma.project.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException(`Project ${id} not found`);
  }
}
