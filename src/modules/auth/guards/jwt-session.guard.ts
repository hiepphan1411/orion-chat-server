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

      // kiểm tra trạng thái tài khoản
      if (!user.isActive) {
        throw new UnauthorizedException('Tài khoản đã bị vô hiệu hóa');
      }

      // xác định nền tảng
      const userAgent = request.headers['user-agent'] || '';
      const xPlatform = String(
        request.headers['x-platform'] || '',
      ).toLowerCase();

      // Xác định nền tảng: mobile or web
      // ưu tiên: Header > UserAgent > Default
      let platform = 'web';

      if (xPlatform === 'mobile') {
        platform = 'mobile';
      } else if (xPlatform === 'web') {
        platform = 'web';
      } else if (
        userAgent.toLowerCase().includes('expo') ||
        userAgent.toLowerCase().includes('react-native')
      ) {
        // check for mobile platform
        platform = 'mobile';
      }
      // else default to 'web'

      // xác thực phiên cho nền tảng
      if (platform === 'mobile') {
        // Check mobile session token
        if (user.mobileSessionToken !== token) {
          this.logger.warn(
            `Giới hạn phiên ${phoneNumber} (mobile). Phát hiện lỗi không khớp mã. Người dùng đã đăng nhập ở nơi khác.`,
          );
          throw new UnauthorizedException(
            'Phiên làm việc đã hết hạn. Bạn đã đăng nhập ở nơi khác.',
          );
        }

        // kiểm tra thời gian phiên
        if (
          isSessionExpired(user.mobileLastActivityAt, SESSION_TIMEOUT.DEFAULT)
        ) {
          this.logger.warn(
            `Giới hạn phiên ${phoneNumber} (mobile). Không có hoạt động trong hơn 15 phút.`,
          );
          user.mobileSessionToken = null as unknown as string;
          await this.userRepo.save(user);

          throw new UnauthorizedException(
            'Phiên làm việc đã hết hạn do không hoạt động.',
          );
        }

        // cập nhật thời gian hoạt động cuối
        user.mobileLastActivityAt = Date.now();
      } else {
        // Web platform
        // kiểm tra token phiên web
        if (user.webSessionToken !== token) {
          this.logger.warn(
            `Giới hạn phiên ${phoneNumber} (web). Phát hiện lỗi không khớp mã. Người dùng đã đăng nhập ở nơi khác.`,
          );
          throw new UnauthorizedException(
            'Phiên làm việc đã hết hạn. Bạn đã đăng nhập ở nơi khác.',
          );
        }

        // kiểm tra thời gian phiên
        if (isSessionExpired(user.webLastActivityAt, SESSION_TIMEOUT.DEFAULT)) {
          this.logger.warn(
            `Giới hạn phiên ${phoneNumber} (web). Không có hoạt động trong hơn 15 phút.`,
          );
          user.webSessionToken = null as unknown as string;
          await this.userRepo.save(user);

          throw new UnauthorizedException(
            'Phiên làm việc đã hết hạn do không hoạt động.',
          );
        }

        // cập nhật thời gian hoạt động cuối
        user.webLastActivityAt = Date.now();
      }

      await this.userRepo.save(user);

      // Gán thông tin người dùng vào yêu cầu
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
