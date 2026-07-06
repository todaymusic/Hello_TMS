import {
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  // GET /api/notifications?userId=&unreadOnly=true
  @Get()
  findByUser(
    @Query('userId') userId: string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    return this.notifications.findByUser(userId, unreadOnly === 'true');
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string) {
    return this.notifications.markRead(id);
  }

  // PATCH /api/notifications/read-all?userId=
  @Patch('read-all')
  markAllRead(@Query('userId') userId: string) {
    return this.notifications.markAllRead(userId);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.notifications.remove(id);
  }
}
