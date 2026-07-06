import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

// 응답에서 비밀번호 해시 제외
const omitPassword = { password: true } as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateUserDto) {
    return this.prisma.user.create({ data: dto, omit: omitPassword });
  }

  findAll() {
    return this.prisma.user.findMany({
      orderBy: { name: 'asc' },
      omit: omitPassword,
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      omit: omitPassword,
    });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);
    // 수동 상태를 활동(업무중/자리비움/방해금지)으로 바꾸면 '퇴근(clockedOut)' 상태 해제
    const clearClockOut =
      dto.status !== undefined && dto.status !== 'off';
    return this.prisma.user.update({
      where: { id },
      data: { ...dto, ...(clearClockOut ? { clockedOut: false } : {}) },
      omit: omitPassword,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.user.delete({ where: { id }, omit: omitPassword });
  }
}
