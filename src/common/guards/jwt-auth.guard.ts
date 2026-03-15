import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Missing or invalid authorization header',
      );
    }

    const token = authHeader.split(' ')[1];

    try {
      const jwtSecret =
        this.configService.get('JWT_SECRET') || 'your-secret-key';

      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new UnauthorizedException('Invalid token format');
      }

      const [header, payload, signature] = parts;

      const expectedSignature = crypto
        .createHmac('sha256', jwtSecret)
        .update(`${header}.${payload}`)
        .digest('base64');

      if (signature !== expectedSignature) {
        throw new UnauthorizedException('Invalid token signature');
      }

      const decoded = JSON.parse(
        Buffer.from(payload, 'base64').toString('utf-8'),
      );

      if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
        throw new UnauthorizedException('Token has expired');
      }

      request.user = decoded;
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Invalid token');
    }
  }
}
