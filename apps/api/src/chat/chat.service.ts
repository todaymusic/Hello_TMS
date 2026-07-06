import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';

const userSel = {
  select: { id: true, name: true, avatarColor: true, dept: true },
} as const;

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  /** 내 채널 목록 (멤버·마지막 메시지·안읽음 수) */
  async listChannels(userId: string) {
    const memberships = await this.prisma.channelMember.findMany({
      where: { userId },
      include: {
        channel: { include: { members: { include: { user: userSel } } } },
      },
    });

    const rows = await Promise.all(
      memberships.map(async (mem) => {
        const ch = mem.channel;
        const last = await this.prisma.channelMessage.findFirst({
          where: { channelId: ch.id },
          orderBy: { createdAt: 'desc' },
          include: { user: userSel },
        });
        const unread = await this.prisma.channelMessage.count({
          where: {
            channelId: ch.id,
            userId: { not: userId },
            ...(mem.lastReadAt ? { createdAt: { gt: mem.lastReadAt } } : {}),
          },
        });
        return {
          id: ch.id,
          name: ch.name,
          type: ch.type,
          pinned: mem.pinned,
          members: ch.members.map((m) => m.user),
          lastMessage: last
            ? { content: last.content, createdAt: last.createdAt, userName: last.user.name }
            : null,
          lastAt: last?.createdAt ?? ch.createdAt,
          unread,
        };
      }),
    );
    // 전체공지 최상단 → 고정 → 최근 메시지 순
    const rank = (r: (typeof rows)[number]) =>
      r.type === 'broadcast' ? 0 : r.pinned ? 1 : 2;
    rows.sort(
      (a, b) =>
        rank(a) - rank(b) ||
        new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime(),
    );
    return rows;
  }

  async pinChannel(channelId: string, userId: string, pinned: boolean) {
    await this.prisma.channelMember.updateMany({
      where: { channelId, userId },
      data: { pinned },
    });
    return { ok: true };
  }

  /** 채널 나가기/삭제 — 멤버 제거, 아무도 없으면 채널 삭제 */
  async leaveChannel(channelId: string, userId: string) {
    await this.prisma.channelMember.deleteMany({ where: { channelId, userId } });
    const remaining = await this.prisma.channelMember.count({ where: { channelId } });
    if (remaining === 0) {
      await this.prisma.channel.delete({ where: { id: channelId } });
    }
    return { ok: true };
  }

  /** 1:1 채널 찾기-또는-생성 */
  async ensureDm(userId: string, peerId: string) {
    if (userId === peerId) throw new BadRequestException('본인과는 대화할 수 없습니다');
    const existing = await this.prisma.channel.findFirst({
      where: {
        type: 'dm',
        AND: [
          { members: { some: { userId } } },
          { members: { some: { userId: peerId } } },
        ],
        members: { every: { userId: { in: [userId, peerId] } } },
      },
    });
    if (existing) return existing;
    return this.prisma.channel.create({
      data: {
        type: 'dm',
        members: { create: [{ userId }, { userId: peerId }] },
      },
    });
  }

  /** 그룹 채널 생성 */
  createGroup(name: string, memberIds: string[]) {
    const ids = [...new Set(memberIds)];
    if (ids.length < 2) throw new BadRequestException('그룹은 2명 이상이어야 합니다');
    return this.prisma.channel.create({
      data: {
        type: 'group',
        name: name?.trim() || '그룹',
        members: { create: ids.map((userId) => ({ userId })) },
      },
    });
  }

  /** 전체 공지 채널 찾기-또는-생성 + 모든 사용자 멤버 보장 */
  async ensureBroadcast() {
    let ch = await this.prisma.channel.findFirst({ where: { type: 'broadcast' } });
    if (!ch) {
      ch = await this.prisma.channel.create({
        data: { type: 'broadcast', name: '전체 공지' },
      });
    }
    const users = await this.prisma.user.findMany({ select: { id: true } });
    const existing = await this.prisma.channelMember.findMany({
      where: { channelId: ch.id },
      select: { userId: true },
    });
    const have = new Set(existing.map((m) => m.userId));
    const missing = users.filter((u) => !have.has(u.id));
    if (missing.length) {
      await this.prisma.channelMember.createMany({
        data: missing.map((u) => ({ channelId: ch.id, userId: u.id })),
      });
    }
    return ch;
  }

  messages(channelId: string) {
    return this.prisma.channelMessage.findMany({
      where: { channelId },
      include: {
        user: userSel,
        replyTo: { include: { user: userSel } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async send(
    channelId: string,
    userId: string,
    content: string,
    mentions?: string[],
    replyToId?: string,
  ) {
    const msg = await this.prisma.channelMessage.create({
      data: {
        channelId,
        userId,
        content,
        mentions: mentions ?? [],
        replyToId: replyToId || null,
      },
      include: {
        user: userSel,
        replyTo: { include: { user: userSel } },
      },
    });

    // 알림 — 멘션받은 사람은 mention, 나머지 멤버는 dm
    const [members, channel] = await Promise.all([
      this.prisma.channelMember.findMany({
        where: { channelId },
        select: { userId: true },
      }),
      this.prisma.channel.findUnique({
        where: { id: channelId },
        select: { name: true, type: true },
      }),
    ]);
    const where =
      channel?.type === 'broadcast' ? '전체 공지' : channel?.name || 'DM';
    const mentionSet = new Set((mentions ?? []).filter((u) => u !== userId));
    const preview = content.length > 40 ? content.slice(0, 40) + '…' : content;
    const notifs = members
      .filter((m) => m.userId !== userId)
      .map((m) =>
        mentionSet.has(m.userId)
          ? {
              userId: m.userId,
              type: 'mention',
              content: `${msg.user.name}님이 «${where}»에서 회원님을 멘션했습니다`,
              link: '/dm',
            }
          : {
              userId: m.userId,
              type: 'dm',
              content: `${msg.user.name} (${where}): ${preview}`,
              link: '/dm',
            },
      );
    if (notifs.length) {
      await this.prisma.notification.createMany({ data: notifs });
      await this.push.notifyMany(notifs);
    }
    return msg;
  }

  async markRead(channelId: string, userId: string) {
    await this.prisma.channelMember.updateMany({
      where: { channelId, userId },
      data: { lastReadAt: new Date() },
    });
    return { ok: true };
  }

  setPin(messageId: string, pinned: boolean) {
    return this.prisma.channelMessage.update({
      where: { id: messageId },
      data: { pinned },
      include: { user: userSel },
    });
  }

  async unreadCount(userId: string) {
    const memberships = await this.prisma.channelMember.findMany({
      where: { userId },
      select: { channelId: true, lastReadAt: true },
    });
    let count = 0;
    for (const m of memberships) {
      count += await this.prisma.channelMessage.count({
        where: {
          channelId: m.channelId,
          userId: { not: userId },
          ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
        },
      });
    }
    return { count };
  }
}
