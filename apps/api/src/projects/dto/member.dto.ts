import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ProjectRole } from '../../../generated/prisma/enums';

// 담당자(owner) 추가 — 역할별 책임자
export class AddOwnerDto {
  @IsString()
  userId!: string;

  @IsOptional()
  @IsEnum(ProjectRole)
  role?: ProjectRole;
}

// 참여자(participant) 추가 — 협업 멤버
export class AddParticipantDto {
  @IsString()
  userId!: string;
}
