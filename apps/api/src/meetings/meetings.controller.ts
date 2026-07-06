import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsBoolean, IsISO8601, IsOptional, IsString } from 'class-validator';
import { MeetingsService } from './meetings.service';

class CreateMeetingDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsISO8601()
  date!: string;

  @IsOptional()
  @IsString()
  driveFileId?: string;

  @IsOptional()
  @IsString()
  videoUrl?: string;

  @IsOptional()
  @IsString()
  transcriptUrl?: string;

  @IsOptional()
  @IsString()
  transcriptText?: string;

  @IsOptional()
  @IsBoolean()
  announce?: boolean;

  @IsOptional()
  @IsString()
  authorId?: string;
}

@Controller('meetings')
export class MeetingsController {
  constructor(private readonly meetings: MeetingsService) {}

  @Get()
  findAll() {
    return this.meetings.findAll();
  }

  // 진단: 드라이브 폴더 파일 목록 (:id 보다 먼저 선언)
  @Get('drive-files')
  driveFiles(@Query('folderId') folderId?: string) {
    return this.meetings.driveFiles(folderId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.meetings.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateMeetingDto) {
    return this.meetings.create(dto);
  }

  // 즉석 회의 녹음 업로드 → STT → AI 요약 → 회의 저장
  @Post('record')
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: 80 * 1024 * 1024 } }))
  record(
    @UploadedFile() file: { buffer: Buffer; mimetype: string },
    @Query('authorId') authorId?: string,
  ) {
    const mt = file?.mimetype ?? '';
    const ext = mt.includes('webm')
      ? 'webm'
      : mt.includes('ogg')
        ? 'ogg'
        : mt.includes('mp4') || mt.includes('m4a')
          ? 'm4a'
          : 'wav';
    return this.meetings.recordAndCreate(file.buffer, ext, authorId);
  }

  // 드라이브 회의 전체 리셋(재임포트용)
  @Post('reset-drive')
  resetDrive() {
    return this.meetings.resetDrive();
  }

  // 드라이브 폴더 동기화(기존/신규 회의 자동 가져오기)
  @Post('sync')
  sync(
    @Query('folderId') folderId?: string,
    @Query('authorId') authorId?: string,
  ) {
    return this.meetings.syncFromDrive(folderId, authorId);
  }

  @Post(':id/summarize')
  resummarize(@Param('id') id: string) {
    return this.meetings.resummarize(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.meetings.remove(id);
  }
}
