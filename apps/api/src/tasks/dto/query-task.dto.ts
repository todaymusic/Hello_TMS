import { IsEnum, IsOptional, IsString } from 'class-validator';
import { Category, TaskStatus } from '../../../generated/prisma/enums';

export class QueryTaskDto {
  @IsOptional()
  @IsString()
  assigneeId?: string;

  @IsOptional()
  @IsString()
  assignerId?: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsEnum(Category)
  category?: Category;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;
}
