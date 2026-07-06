import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { LeaveStatus } from '../../generated/prisma/enums';
import { CreateLeaveDto } from './dto/create-leave.dto';
import { UpdateLeaveStatusDto } from './dto/update-leave-status.dto';
import { LeavesService } from './leaves.service';

@Controller('leaves')
export class LeavesController {
  constructor(private readonly leaves: LeavesService) {}

  @Post()
  create(@Body() dto: CreateLeaveDto) {
    return this.leaves.create(dto);
  }

  // GET /api/leaves?userId=&status=
  @Get()
  findAll(
    @Query('userId') userId?: string,
    @Query('status') status?: LeaveStatus,
  ) {
    return this.leaves.findAll({ userId, status });
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateLeaveStatusDto) {
    return this.leaves.updateStatus(id, dto);
  }

  // 본인: 승인된 휴가 취소 요청
  @Patch(':id/request-cancel')
  requestCancel(@Param('id') id: string) {
    return this.leaves.requestCancel(id);
  }

  // 관리자: 취소 요청 거절(플래그 해제)
  @Patch(':id/deny-cancel')
  denyCancel(@Param('id') id: string) {
    return this.leaves.denyCancel(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.leaves.remove(id);
  }
}
