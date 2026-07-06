import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import {
  Category,
  Priority,
  TaskStatus,
} from '../../../generated/prisma/enums';

export class CreateTaskDto {
  @IsString()
  title!: string;

  // 대분류: long / shorts / project
  @IsEnum(Category)
  category!: Category;

  // 소분류 (업무 영역: 디자인/개발/마케팅...)
  @IsOptional()
  @IsString()
  subCategory?: string;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  // 산출물 요구 (taskType = report/video/both/none 의 boolean 표현)
  @IsOptional()
  @IsBoolean()
  reportRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  videoRequired?: boolean;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  descriptionPrompt?: string;

  @IsOptional()
  @IsString()
  aiDescriptionDoc?: string;

  @IsOptional()
  @IsString()
  statusMemo?: string;

  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @IsOptional()
  @IsString()
  plannedDate?: string; // ISO 또는 "" (해제)

  @IsOptional()
  @IsInt()
  dayOrder?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  estimateMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progress?: number;

  // 부여자 / 수행자 / 프로젝트
  @IsOptional()
  @IsString()
  assignerId?: string;

  @IsOptional()
  @IsString()
  assigneeId?: string;

  @IsOptional()
  @IsString()
  projectId?: string;
}
