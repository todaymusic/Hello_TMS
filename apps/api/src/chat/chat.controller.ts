import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
} from 'class-validator';
import { Delete } from '@nestjs/common';
import { ChatService } from './chat.service';

class DmDto {
  @IsString()
  userId!: string;

  @IsString()
  peerId!: string;
}
class GroupDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsArray()
  @ArrayMinSize(2)
  @IsString({ each: true })
  memberIds!: string[];
}
class SendDto {
  @IsString()
  userId!: string;

  @IsString()
  content!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mentions?: string[];

  @IsOptional()
  @IsString()
  replyToId?: string;
}
class PinDto {
  @IsBoolean()
  pinned!: boolean;
}

@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  // GET /api/chat/channels?userId=
  @Get('channels')
  channels(@Query('userId') userId: string) {
    return this.chat.listChannels(userId);
  }

  // GET /api/chat/unread?userId=
  @Get('unread')
  unread(@Query('userId') userId: string) {
    return this.chat.unreadCount(userId);
  }

  // 1:1 채널 찾기/생성
  @Post('dm')
  dm(@Body() dto: DmDto) {
    return this.chat.ensureDm(dto.userId, dto.peerId);
  }

  // 그룹 채널 생성
  @Post('group')
  group(@Body() dto: GroupDto) {
    return this.chat.createGroup(dto.name ?? '그룹', dto.memberIds);
  }

  // 전체 공지 채널 보장
  @Post('broadcast')
  broadcast() {
    return this.chat.ensureBroadcast();
  }

  // 채널 메시지 목록
  @Get('channels/:id/messages')
  messages(@Param('id') id: string) {
    return this.chat.messages(id);
  }

  // 메시지 전송
  @Post('channels/:id/messages')
  send(@Param('id') id: string, @Body() dto: SendDto) {
    return this.chat.send(id, dto.userId, dto.content, dto.mentions, dto.replyToId);
  }

  // 읽음 처리
  @Patch('channels/:id/read')
  read(@Param('id') id: string, @Query('userId') userId: string) {
    return this.chat.markRead(id, userId);
  }

  // 채널 고정/해제(개인별)
  @Patch('channels/:id/pin')
  pinChannel(
    @Param('id') id: string,
    @Query('userId') userId: string,
    @Body() dto: PinDto,
  ) {
    return this.chat.pinChannel(id, userId, dto.pinned);
  }

  // 채널 나가기/삭제
  @Delete('channels/:id/members')
  leave(@Param('id') id: string, @Query('userId') userId: string) {
    return this.chat.leaveChannel(id, userId);
  }

  // 메시지 고정/해제
  @Patch('messages/:id/pin')
  pin(@Param('id') id: string, @Body() dto: PinDto) {
    return this.chat.setPin(id, dto.pinned);
  }
}
