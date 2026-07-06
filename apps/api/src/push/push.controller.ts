import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { PushService } from './push.service';

@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  // 프론트가 구독 시 VAPID 공개키 조회
  @Get('vapid')
  vapid() {
    return { publicKey: this.push.publicKey, enabled: this.push.enabled };
  }

  // 기기 구독 등록
  @Post('subscribe')
  subscribe(
    @Query('userId') userId: string,
    @Body() sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  ) {
    return this.push.subscribe(userId, sub);
  }
}
