import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/modules/users/entities/user.entity';
import { Request } from 'express';
import * as crypto from 'crypto';

interface JwtPayload {
  phoneNumber: string;
  iat: number;
  exp: number;
}

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    phoneNumber: string;
    fullName: string;
    email: string | null;
  };
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private configService: ConfigService,

    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    try {
      const secret =
        this.configService.get<string>('JWT_SECRET') || 'your-secret-key';
      const payload = this.verifyToken(token, secret);

      const user = await this.userRepository.findOne({
        where: { phoneNumber: payload.phoneNumber },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Kiểm tra Session Mismatch - Token phải khớp với token lưu trong DB
      const platform = (request.headers['x-platform'] as string) || 'web';
      const tokenMatchesWeb = user.webSessionToken === token;
      const tokenMatchesMobile = user.mobileSessionToken === token;

      // this.logger.log(
      //   '[JWT Guard] Platform: ' +
      //     platform +
      //     ' | Web match: ' +
      //     tokenMatchesWeb +
      //     ' | Mobile match: ' +
      //     tokenMatchesMobile,
      // );

      // Kiểm tra token phải khớp với session trong DB
      if (!tokenMatchesWeb && !tokenMatchesMobile) {
        this.logger.warn(
          '[Session Mismatch] User ' +
            payload.phoneNumber +
            ' - token không khớp bất kỳ session nào',
        );
        throw new UnauthorizedException(
          'Phiên làm việc đã hết hạn hoặc bạn đã đăng nhập ở nơi khác',
        );
      }

      // Kiểm tra platform-specific session
      if (platform === 'web' && !tokenMatchesWeb) {
        this.logger.warn(
          '[Session Mismatch] User ' +
            payload.phoneNumber +
            ' - token web không khớp (có thể đã login ở browser khác)',
        );
        throw new UnauthorizedException(
          'Bạn đã đăng nhập ở thiết bị web khác. Phiên hiện tại đã hết hạn.',
        );
      }

      if (platform === 'mobile' && !tokenMatchesMobile) {
        this.logger.warn(
          '[Session Mismatch] User ' +
            payload.phoneNumber +
            ' - token mobile không khớp (có thể đã login ở mobile khác)',
        );
        throw new UnauthorizedException(
          'Bạn đã đăng nhập ở thiết bị mobile khác. Phiên hiện tại đã hết hạn.',
        );
      }

      request.user = {
        userId: user.userId,
        phoneNumber: user.phoneNumber,
        fullName: user.fullName,
        email: user.email || null,
      };

      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Invalid or expired token';
      throw new UnauthorizedException(errorMessage);
    }
  }

  /**
   * Verify JWT token sử dụng manual crypto (match với auth.service generation)
   */
  private verifyToken(token: string, secret: string): JwtPayload {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid token format');
    }

    const [headerB64, payloadB64, signatureB64] = parts;

    // Recreate signature
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(`${headerB64}.${payloadB64}`)
      // .digest('base64')
      // .replace(/\+/g, '-')
      // .replace(/\//g, '_')
      // .replace(/=+$/g, '');
      .digest('base64url');

    // Verify signature
    if (signatureB64 !== expectedSignature) {
      throw new Error('Invalid token signature');
    }

    // Decode and parse payload
    const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf-8');
    const payload = JSON.parse(payloadJson) as JwtPayload;

    // Check expiry
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      throw new Error('Token expired');
    }

    return payload;
  }

  /**
   * Extract JWT token từ Authorization header
   * Format: "Bearer <token>"
   */
  private extractToken(request: Request): string | null {
    const authHeader = request.headers.authorization;

    if (!authHeader || typeof authHeader !== 'string') {
      return null;
    }

    const parts = authHeader.split(' ');
    const [scheme, token] = parts;

    if (scheme !== 'Bearer' || !token) {
      return null;
    }

    return token;
  }
}
