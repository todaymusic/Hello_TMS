import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CreateProjectDto } from './dto/create-project.dto';
import { AddOwnerDto, AddParticipantDto } from './dto/member.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post()
  create(@Body() dto: CreateProjectDto) {
    return this.projects.create(dto);
  }

  @Get()
  findAll() {
    return this.projects.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.projects.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projects.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.projects.remove(id);
  }

  // 담당자(owner)
  @Post(':id/owners')
  addOwner(@Param('id') id: string, @Body() dto: AddOwnerDto) {
    return this.projects.addOwner(id, dto);
  }

  @Delete(':id/owners/:userId')
  removeOwner(@Param('id') id: string, @Param('userId') userId: string) {
    return this.projects.removeOwner(id, userId);
  }

  // 참여자(participant)
  @Post(':id/participants')
  addParticipant(@Param('id') id: string, @Body() dto: AddParticipantDto) {
    return this.projects.addParticipant(id, dto);
  }

  @Delete(':id/participants/:userId')
  removeParticipant(@Param('id') id: string, @Param('userId') userId: string) {
    return this.projects.removeParticipant(id, userId);
  }
}
