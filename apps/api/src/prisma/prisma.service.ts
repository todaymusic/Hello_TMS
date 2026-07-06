import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

/**
 * Prisma 7 부터 datasource url 은 schema 가 아니라 런타임 driver adapter 로 주입한다.
 * (@prisma/adapter-pg + pg). DATABASE_URL 은 .env 에서 읽는다.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL,
    });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Prisma connected (pg driver adapter)');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
