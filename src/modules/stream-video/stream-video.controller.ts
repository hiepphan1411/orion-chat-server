import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { JwtPayload } from 'jsonwebtoken';
import * as jwt from 'jsonwebtoken';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';

type StreamVideoTokenBody = {
  userId?: string;
  name?: string;
  image?: string;
};

@Controller('stream-video')
@UseGuards(JwtAuthGuard)
export class StreamVideoController {
  constructor(private readonly configService: ConfigService) {}

  @Post('token')
  createToken(
    @CurrentUser() user: JwtPayload,
    @Body() body: StreamVideoTokenBody,
  ) {
    const authenticatedUserId = String(user?.userId || user?.sub || '').trim();
    const requestedUserId = String(body?.userId || authenticatedUserId).trim();

    if (!authenticatedUserId) {
      throw new BadRequestException('Authenticated user id is required');
    }

    if (requestedUserId && requestedUserId !== authenticatedUserId) {
      throw new BadRequestException('Cannot create token for another user');
    }

    const apiKey =
      this.configService.get<string>('STREAM_API_KEY') ||
      this.configService.get<string>('EXPO_PUBLIC_STREAM_API_KEY');
    const secret = this.configService.get<string>('STREAM_SECRET_KEY');

    if (!apiKey || !secret) {
      throw new BadRequestException(
        'STREAM_API_KEY and STREAM_SECRET_KEY must be configured',
      );
    }

    const token = jwt.sign(
      {
        user_id: authenticatedUserId,
      },
      secret,
      {
        algorithm: 'HS256',
      },
    );

    return {
      apiKey,
      token,
      user: {
        id: authenticatedUserId,
        name:
          body?.name ||
          String(user?.fullName || user?.phoneNumber || authenticatedUserId),
        image: body?.image,
      },
    };
  }
}
