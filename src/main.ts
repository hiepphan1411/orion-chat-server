import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

function parseAllowedOrigins(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

async function bootstrap() {
<<<<<<< Updated upstream
  const app = await NestFactory.create(AppModule);
=======
  console.log('🚀 [bootstrap] Starting bootstrap...');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  console.log('✅ [bootstrap] NestFactory.create completed');

  const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);
>>>>>>> Stashed changes

  // tăng giới hạn kích thước yêu cầu cho các tệp đính kèm AI (âm thanh/hình ảnh base64).
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  app.enableCors({
<<<<<<< Updated upstream
    origin: [
      '*',
      'http://localhost:5173',
      'http://localhost:3000',
      'http://localhost:5174',
      'http://localhost:3001',
    ],
=======
    origin: (origin, callback) => {
      // Cho phép không có origin (như Postman, mobile app, v.v.)
      if (!origin || allowedOrigins.length === 0) {
        callback(null, true);
        return;
      }

      const normalizedOrigin = origin.replace(/\/$/, '');
      if (allowedOrigins.includes(normalizedOrigin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
>>>>>>> Stashed changes
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  );

  // app.enableCors();

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap().catch(console.error);
