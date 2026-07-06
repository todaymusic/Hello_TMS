import {
  IsArray,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateMessageDto {
  @IsString()
  projectId!: string;

  @IsString()
  userId!: string;

  @IsString()
  content!: string;

  // 멘션된 userId 배열
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mentions?: string[];
}
