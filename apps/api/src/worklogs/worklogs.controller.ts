import { Controller, Get, Query } from '@nestjs/common';
import { WorkLogsService } from './worklogs.service';

@Controller('worklogs')
export class WorkLogsController {
  constructor(private readonly worklogs: WorkLogsService) {}

  // GET /api/worklogs?userId=&taskId=&date=YYYY-MM-DD
  @Get()
  findAll(
    @Query('userId') userId?: string,
    @Query('taskId') taskId?: string,
    @Query('date') date?: string,
  ) {
    return this.worklogs.findAll({ userId, taskId, date });
  }

  // GET /api/worklogs/summary?userId=&date=YYYY-MM-DD
  @Get('summary')
  summary(@Query('userId') userId: string, @Query('date') date: string) {
    return this.worklogs.dailySummary(userId, date);
  }
}
