import { PartialType } from '@nestjs/mapped-types';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { CreateProjectDto } from './create-project.dto';

export class UpdateProjectDto extends PartialType(CreateProjectDto) {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progress?: number;

  // 프로젝트 리포트 노트 {summary, issues, next} — 서버 보관
  @IsOptional()
  reportNotes?: { summary?: string; issues?: string; next?: string };
}
