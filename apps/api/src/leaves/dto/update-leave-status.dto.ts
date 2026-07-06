import { IsEnum } from 'class-validator';
import { LeaveStatus } from '../../../generated/prisma/enums';

export class UpdateLeaveStatusDto {
  @IsEnum(LeaveStatus)
  status!: LeaveStatus;
}
