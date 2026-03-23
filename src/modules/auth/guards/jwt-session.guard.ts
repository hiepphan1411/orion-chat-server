import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import type { Request } from 'express';
import {
  SESSION_TIMEOUT,
  isSessionExpired,
} from '../../../config/session.config';

interface TokenPayload {
  phoneNumber: string;
  iat: number;
  exp: number;
}

@Injectable()
export class JwtSessionGuard implements CanActivate {
  private readonly logger = new Logger(JwtSessionGuard.name);

  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: any }>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Token không tìm thấy');
    }

    try {
      //trích xuất số điện thoại từ token
      const phoneNumber = this.extractPhoneFromToken(token);

      // Find user
      const user = await this.userRepo.findOne({
        where: { phoneNumber },
      });

      if (!user) {
        throw new UnauthorizedException('Người dùng không tồn tại');
      }

      // Check if user is active
      if (!user.isActive) {
        throw new UnauthorizedException('Tài khoản đã bị vô hiệu hóa');
      }

      // Single Session Login

      if (user.currentSessionToken !== token) {
        this.logger.warn(
          `Session expired for user ${phoneNumber}. Token mismatch detected. User logged in elsewhere.`,
        );
        throw new UnauthorizedException(
          'Phiên làm việc đã hết hạn. Bạn đã đăng nhập ở nơi khác.',
        );
      }

      // Session Timeout kiểm tra nếu không có hoạt động

      if (isSessionExpired(user.lastActivityAt, SESSION_TIMEOUT.DEFAULT)) {
        this.logger.warn(
          `Session timeout for user ${phoneNumber}. No activity for more than 15 minutes.`,
        );
        // xóa token phiên làm việc
        user.currentSessionToken = null as unknown as string;
        await this.userRepo.save(user);

        throw new UnauthorizedException(
          'Phiên làm việc đã hết hạn do không hoạt động.',
        );
      }

      // Update last activity time
      user.lastActivityAt = Date.now();
      await this.userRepo.save(user);

      // Attach user info to request
      request.user = {
        phoneNumber: user.phoneNumber,
        userId: user.userId,
        fullName: user.fullName,
      };

      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error('JWT Session Guard Error:', errorMessage);
      throw new UnauthorizedException(errorMessage || 'Xác thực không hợp lệ');
    }
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const authHeader = request.headers.authorization;
    if (!authHeader) return undefined;

    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' ? token : undefined;
  }

  private extractPhoneFromToken(token: string): string {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid token format');
      }

      const payload = JSON.parse(
        Buffer.from(parts[1], 'base64').toString('utf-8'),
      ) as TokenPayload;
      return payload.phoneNumber;
    } catch {
      throw new UnauthorizedException('Token không hợp lệ');
    }
  }
}
