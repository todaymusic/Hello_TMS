import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { IsString } from 'class-validator';
import { AttendanceService } from './attendance.service';

class CheckDto {
  @IsString()
  userId!: string;
}

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Post('check-in')
  checkIn(@Body() dto: CheckDto) {
    return this.attendance.checkIn(dto.userId);
  }

  @Post('check-out')
  checkOut(@Body() dto: CheckDto) {
    return this.attendance.checkOut(dto.userId);
  }

  // GET /api/attendance?userId=&month=YYYY-MM
  @Get()
  findByUser(
    @Query('userId') userId: string,
    @Query('month') month?: string,
  ) {
    return this.attendance.findByUser(userId, month);
  }
}
