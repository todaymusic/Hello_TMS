import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { ReactionDto } from './dto/reaction.dto';

const msgInclude = {
  user: { select: { id: true, name: true, avatarColor: true } },
} as const;

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  async create(dto: CreateMessageDto) {
    const message = await this.prisma.message.create({
      data: {
        projectId: dto.projectId,
        userId: dto.userId,
        content: dto.content,
        mentions: dto.mentions ?? [],
      },
      include: msgInclude,
    });

    // 멘션된 사용자에게 알림 생성
    if (dto.mentions?.length) {
      const project = await this.prisma.project.findUnique({
        where: { id: dto.projectId },
        select: { name: true },
      });
      const notifs = dto.mentions
        .filter((uid) => uid !== dto.userId)
        .map((uid) => ({
          userId: uid,
          type: 'mention',
          content: `${message.user.name}님이 «${project?.name ?? '프로젝트'}»에서 회원님을 멘션했습니다`,
          link: `/projects/${dto.projectId}`,
        }));
      await this.prisma.notification.createMany({ data: notifs });
      await this.push.notifyMany(notifs);
    }

    return message;
  }

  findByProject(projectId: string) {
    return this.prisma.message.findMany({
      where: { projectId },
      include: msgInclude,
      orderBy: { createdAt: 'asc' },
    });
  }

  /** 이모지 리액션 토글 (reactions = {emoji: [userId]}) */
  async toggleReaction(messageId: string, dto: ReactionDto) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });
    if (!message) throw new NotFoundException(`Message ${messageId} not found`);

    const reactions: Record<string, string[]> =
      (message.reactions as Record<string, string[]> | null) ?? {};
    const users = new Set(reactions[dto.emoji] ?? []);
    if (users.has(dto.userId)) users.delete(dto.userId);
    else users.add(dto.userId);

    if (users.size === 0) delete reactions[dto.emoji];
    else reactions[dto.emoji] = [...users];

    return this.prisma.message.update({
      where: { id: messageId },
      data: { reactions: reactions as unknown as Prisma.InputJsonValue },
      include: msgInclude,
    });
  }

  async remove(id: string) {
    const exists = await this.prisma.message.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException(`Message ${id} not found`);
    return this.prisma.message.delete({ where: { id } });
  }
}
