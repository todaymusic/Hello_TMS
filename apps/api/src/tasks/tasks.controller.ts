import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CreateTaskDto } from './dto/create-task.dto';
import { EndTaskDto } from './dto/end-task.dto';
import { QueryTaskDto } from './dto/query-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TasksService } from './tasks.service';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Post()
  create(@Body() dto: CreateTaskDto) {
    return this.tasks.create(dto);
  }

  @Get()
  findAll(@Query() query: QueryTaskDto) {
    return this.tasks.findAll(query);
  }

  // 하루 경계 리셋 — 전날부터 진행중이던 내 업무를 자동 '중단'으로 내림(앱 진입 시 호출)
  @Post('day-reset')
  dayReset(@Query('userId') userId: string) {
    return this.tasks.dayReset(userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tasks.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTaskDto) {
    return this.tasks.update(id, dto);
  }

  // 내 활동 체크리스트: 시작
  @Post(':id/start')
  start(@Param('id') id: string) {
    return this.tasks.start(id);
  }

  // 요청받은 업무 수락
  @Post(':id/accept')
  accept(@Param('id') id: string) {
    return this.tasks.accept(id);
  }

  // 요청받은 업무 미수락(반려, +사유)
  @Post(':id/reject')
  reject(@Param('id') id: string, @Body() body: { reason?: string }) {
    return this.tasks.reject(id, body?.reason ?? '');
  }

  // 반려된 업무 재요청(부여자)
  @Post(':id/request-again')
  requestAgain(@Param('id') id: string) {
    return this.tasks.requestAgain(id);
  }

  // 완료 검수: AI 평가 생성
  @Post(':id/ai-review')
  aiReview(@Param('id') id: string) {
    return this.tasks.aiReview(id);
  }

  // 재작업 요청(+사유)
  @Post(':id/rework')
  rework(@Param('id') id: string, @Body() body: { reason?: string }) {
    return this.tasks.rework(id, body?.reason ?? '');
  }

  // 승인 + 등급
  @Post(':id/approve')
  approve(@Param('id') id: string, @Body() body: { grade?: string }) {
    return this.tasks.approve(id, body?.grade ?? '양호');
  }

  // 잠시 중단 / 재개 (세션 시간 기록)
  @Post(':id/pause')
  pause(@Param('id') id: string, @Body() body: { reason?: string }) {
    return this.tasks.pause(id, body?.reason);
  }

  @Post(':id/resume')
  resume(@Param('id') id: string) {
    return this.tasks.resume(id);
  }

  // 내 활동 체크리스트: 종료(+산출물)
  @Post(':id/end')
  end(@Param('id') id: string, @Body() dto: EndTaskDto) {
    return this.tasks.end(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.tasks.remove(id);
  }
}
