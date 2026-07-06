import { Injectable, Logger } from '@nestjs/common';
import webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PushService {
  private readonly log = new Logger('PushService');
  private ready = false;

  constructor(private readonly prisma: PrismaService) {
    const pub = process.env.VAPID_PUBLIC;
    const priv = process.env.VAPID_PRIVATE;
    if (pub && priv) {
      webpush.setVapidDetails(
        process.env.VAPID_SUBJECT || 'mailto:today@theducorp.com',
        pub,
        priv,
      );
      this.ready = true;
    }
  }

  get publicKey() {
    return process.env.VAPID_PUBLIC ?? null;
  }
  get enabled() {
    return this.ready;
  }

  async subscribe(userId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: { userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      update: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    });
  }

  /** 한 사용자의 모든 기기로 푸시 발송 */
  async sendToUser(userId: string, payload: { title: string; body: string; url?: string }) {
    if (!this.ready) return;
    const subs = await this.prisma.pushSubscription.findMany({ where: { userId } });
    const data = JSON.stringify(payload);
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            data,
          );
        } catch (e: unknown) {
          const code = (e as { statusCode?: number })?.statusCode;
          // 만료/무효 구독 정리
          if (code === 404 || code === 410) {
            await this.prisma.pushSubscription.delete({ where: { endpoint: s.endpoint } }).catch(() => {});
          } else {
            this.log.warn(`push 실패: ${code ?? e}`);
          }
        }
      }),
    );
  }

  /** 여러 알림(userId+content+link)을 각각 푸시 */
  async notifyMany(items: { userId: string; content: string; link?: string | null }[]) {
    await Promise.all(
      items.map((i) => this.sendToUser(i.userId, { title: 'TMS 알림', body: i.content, url: i.link ?? '/' })),
    );
  }
}
