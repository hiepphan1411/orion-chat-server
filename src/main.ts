import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  console.log('[bootstrap] Starting bootstrap...');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  console.log('[bootstrap] NestFactory.create completed');

  // Danh sách allowed origins - KHÔNG có trailing slash
  const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:5174',
    'http://localhost:3001',
    'https://d1m0lu9iwqsfsh.cloudfront.net',
    'http://orion-web-chat-staging.s3-website-ap-southeast-1.amazonaws.com',
    'https://deceitfully-unquailing-haylee.ngrok-free.dev',
    'https://foveate-tristan-disepalous.ngrok-free.dev',
  ];

  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  // CORS cho HTTP API (REST)
  app.enableCors({
    origin: (origin, callback) => {
      // Cho phép không có origin (như Postman, mobile app, v.v.)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
    optionsSuccessStatus: 204,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: false,
    }),
  );

  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
  console.log(`Application is running on: ${await app.getUrl()}`);
}

bootstrap().catch(console.error);
