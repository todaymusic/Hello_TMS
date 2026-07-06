import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AttendanceModule } from './attendance/attendance.module';
import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat/chat.module';
import { LeavesModule } from './leaves/leaves.module';
import { MeetingsModule } from './meetings/meetings.module';
import { MessagesModule } from './messages/messages.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { PushModule } from './push/push.module';
import { ScheduleModule } from './schedule/schedule.module';
import { TasksModule } from './tasks/tasks.module';
import { UsersModule } from './users/users.module';
import { WorkLogsModule } from './worklogs/worklogs.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    AiModule,
    UsersModule,
    ProjectsModule,
    TasksModule,
    MessagesModule,
    WorkLogsModule,
    AttendanceModule,
    LeavesModule,
    NotificationsModule,
    ChatModule,
    ScheduleModule,
    MeetingsModule,
    PushModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
