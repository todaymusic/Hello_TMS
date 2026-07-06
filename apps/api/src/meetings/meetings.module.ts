import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { ChatModule } from '../chat/chat.module';
import { DriveService } from './drive.service';
import { SttService } from './stt.service';
import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';

@Module({
  imports: [AiModule, ChatModule],
  controllers: [MeetingsController],
  providers: [MeetingsService, DriveService, SttService],
})
export class MeetingsModule {}
