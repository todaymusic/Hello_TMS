import { IsOptional, IsString } from 'class-validator';

/**
 * 내 활동 체크리스트에서 업무 "종료" 시 입력하는 산출물 폼.
 * reportRequired/videoRequired 여부에 따라 프론트에서 입력칸이 달라진다.
 */
export class EndTaskDto {
  @IsOptional()
  @IsString()
  reportLink?: string;

  @IsOptional()
  @IsString()
  videoLink?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
