import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { AiService } from './ai.service';

class TaskDocDto {
  @IsString()
  memo!: string;

  @IsOptional()
  @IsString()
  prompt?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  subCategory?: string;
}

@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  // 업무 부여 폼: 간략 메모 → 업무설명 doc
  @Post('task-doc')
  taskDoc(@Body() dto: TaskDocDto) {
    return this.ai.generateTaskDoc(dto);
  }

  // 업무 부여 폼: 상세 설명 → 예상 소요시간(분) 자동 측정
  @Post('estimate-duration')
  estimateDuration(@Body() dto: TaskDocDto) {
    return this.ai.estimateDuration(dto);
  }

  // 프로젝트 상세: 대화 → AI 소통 요약 (저장 후 반환)
  @Post('project-summary/:id')
  projectSummary(@Param('id') id: string) {
    return this.ai.summarizeProject(id);
  }

  // 데일리 평가: 업무설명↔노트/보고↔진행률 일치도 한줄평
  @Post('daily-review')
  dailyReview(
    @Query('userId') userId: string,
    @Query('date') date: string,
    @Body() body: { comment?: string; taskIds?: string[] },
  ) {
    return this.ai.dailyReview(userId, date, body?.comment, body?.taskIds);
  }

  // 저장된 데일리 리포트/AI 평가 조회 — 지난일 조회용
  @Get('daily-report')
  getDailyReport(
    @Query('userId') userId: string,
    @Query('date') date: string,
  ) {
    return this.ai.getDailyReport(userId, date);
  }

  // 데일리 리포트 삭제(해당 사용자·날짜)
  @Delete('daily-report')
  deleteDailyReport(
    @Query('userId') userId: string,
    @Query('date') date: string,
  ) {
    return this.ai.deleteDailyReport(userId, date);
  }
}
