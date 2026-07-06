import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { CreateMessageDto } from './dto/create-message.dto';
import { ReactionDto } from './dto/reaction.dto';
import { MessagesService } from './messages.service';

@Controller('messages')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Post()
  create(@Body() dto: CreateMessageDto) {
    return this.messages.create(dto);
  }

  // GET /api/messages?projectId=xxx
  @Get()
  findByProject(@Query('projectId') projectId: string) {
    return this.messages.findByProject(projectId);
  }

  @Post(':id/reactions')
  toggleReaction(@Param('id') id: string, @Body() dto: ReactionDto) {
    return this.messages.toggleReaction(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.messages.remove(id);
  }
}
