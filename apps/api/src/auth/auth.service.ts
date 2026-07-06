import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private sanitize<T extends { password?: string | null }>(user: T) {
    const { password: _pw, ...rest } = user;
    void _pw;
    return rest;
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.password) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다');
    }
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다');
    }
    const token = await this.jwt.signAsync({ sub: user.id, email: user.email });
    // 로그인 = 새 근무 세션 시작: 접속 갱신 + 퇴근 상태 해제
    const fresh = await this.prisma.user.update({
      where: { id: user.id },
      data: { lastSeenAt: new Date(), clockedOut: false },
    });
    return { accessToken: token, user: this.sanitize(fresh) };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다');
    return this.sanitize(user);
  }

  /** 하트비트 — 접속 중임을 알림(현황판 온라인 판정용) */
  async heartbeat(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastSeenAt: new Date() },
    });
    return { ok: true };
  }

  /** 업무 종료(퇴근) — 현황판에 '업무 종료'로 표시 */
  async clockOut(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { clockedOut: true, lastSeenAt: new Date() },
    });
    return { ok: true };
  }

  /** 비밀번호 변경 — 현재 비밀번호 검증 후 교체 (로그인 사용자) */
  async changePassword(userId: string, current: string, next: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다');
    if (!user.password) {
      throw new BadRequestException('비밀번호가 설정되어 있지 않습니다');
    }
    const ok = await bcrypt.compare(current, user.password);
    if (!ok) {
      throw new UnauthorizedException('현재 비밀번호가 올바르지 않습니다');
    }
    const hash = await bcrypt.hash(next, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hash },
    });
    return { ok: true };
  }

  /**
   * 최초 비밀번호 설정 — 비밀번호가 아직 없는(null) 사용자만 허용.
   * 초기 팀원 비번 세팅 후 자동으로 닫힘(이미 설정된 사용자는 403).
   */
  async setInitialPassword(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다');
    if (user.password) {
      throw new ForbiddenException(
        '이미 비밀번호가 설정된 사용자입니다 (변경은 로그인 후)',
      );
    }
    const hash = await bcrypt.hash(password, 10);
    const updated = await this.prisma.user.update({
      where: { email },
      data: { password: hash },
    });
    return { ok: true, user: this.sanitize(updated) };
  }

  /** 내 활동 개인 메모(포스트잇) 조회 — 본인 것만 */
  async getMemo(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { scratchMemo: true },
    });
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다');
    return { memo: user.scratchMemo ?? '' };
  }

  /** 내 활동 개인 메모 저장 — 자동저장(디바운스)에서 호출 */
  async setMemo(userId: string, memo: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { scratchMemo: memo },
    });
    return { ok: true };
  }
}
