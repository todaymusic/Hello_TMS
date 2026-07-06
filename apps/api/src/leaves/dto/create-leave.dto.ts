import { IsEnum, IsISO8601, IsOptional, IsString } from 'class-validator';
import { LeaveType } from '../../../generated/prisma/enums';

export class CreateLeaveDto {
  @IsString()
  userId!: string;

  @IsOptional()
  @IsEnum(LeaveType)
  type?: LeaveType;

  @IsISO8601()
  startDate!: string;

  @IsISO8601()
  endDate!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
