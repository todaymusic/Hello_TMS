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
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ScheduleService } from './schedule.service';

class CreateBlockDto {
  @IsString()
  userId!: string;

  @IsString()
  date!: string;

  @IsOptional()
  @IsString()
  taskId?: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsInt()
  @Min(0)
  @Max(1439)
  startMin!: number;

  @IsInt()
  @Min(1)
  @Max(1440)
  endMin!: number;
}

class UpdateBlockDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  startMin?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  endMin?: number;
}

@Controller('schedule')
export class ScheduleController {
  constructor(private readonly schedule: ScheduleService) {}

  // GET /api/schedule?userId=&date=YYYY-MM-DD
  @Get()
  list(@Query('userId') userId: string, @Query('date') date: string) {
    return this.schedule.list(userId, date);
  }

  @Post()
  create(@Body() dto: CreateBlockDto) {
    return this.schedule.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBlockDto) {
    return this.schedule.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.schedule.remove(id);
  }
}
