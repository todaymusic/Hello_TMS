import { Module } from '@nestjs/common';
import { WorkLogsController } from './worklogs.controller';
import { WorkLogsService } from './worklogs.service';

@Module({
  controllers: [WorkLogsController],
  providers: [WorkLogsService],
  exports: [WorkLogsService],
})
export class WorkLogsModule {}
