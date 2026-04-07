import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  console.log('🚀 [bootstrap] Starting bootstrap...');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  console.log('✅ [bootstrap] NestFactory.create completed');

  const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:5174',
    'http://localhost:3001',
    'https://d1m0lu9iwqsfsh.cloudfront.net',
    'http://orion-web-chat-staging.s3-website-ap-southeast-1.amazonaws.com',
  ];

  // tăng giới hạn kích thước yêu cầu cho các tệp đính kèm AI (âm thanh/hình ảnh base64).
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
    optionsSuccessStatus: 204,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
    }),
  );

  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });

  console.log('🔄 [bootstrap] Calling app.listen()...');
  const server = await app.listen(process.env.PORT ?? 3000);
  console.log(`✅ [bootstrap] Server listening on port ${process.env.PORT ?? 3000}`);
  console.log(`🎉 Application is running on: ${await app.getUrl()}`);
}
bootstrap().catch(console.error);
