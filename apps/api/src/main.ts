import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 모든 라우트에 /api prefix
  app.setGlobalPrefix('api');

  // DTO 검증 + 화이트리스트 (정의 안 된 필드 제거, 타입 자동 변환)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // CORS: 로컬 + Railway 배포 도메인(*.up.railway.app) + FRONTEND_ORIGIN 허용
  app.enableCors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // 서버간 호출/curl
      const ok =
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
        /\.up\.railway\.app$/.test(origin) ||
        origin === process.env.FRONTEND_ORIGIN;
      cb(null, ok);
    },
    credentials: true,
  });

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
  console.log(`🚀 TMS API running on http://localhost:${port}/api`);
}
void bootstrap();
