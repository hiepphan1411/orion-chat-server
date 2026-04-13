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

interface TokenPayload {
  phoneNumber: string;
  userId?: string;
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
      // Trích xuất số điện thoại từ token
      const phoneNumber = this.extractPhoneFromToken(token);

      // Tìm user
      const user = await this.userRepo.findOne({
        where: { phoneNumber },
      });

      if (!user) {
        throw new UnauthorizedException('Người dùng không tồn tại');
      }

      // Kiểm tra trạng thái tài khoản
      if (!user.isActive) {
        throw new UnauthorizedException('Tài khoản đã bị vô hiệu hóa');
      }

      // Kiểm tra Session Mismatch - Token phải khớp với token lưu trong DB
      // Platform được lấy từ X-Platform header (FE gửi)
      const platform = (request.headers['x-platform'] as string) || 'web';
      const tokenMatchesWeb = user.webSessionToken === token;
      const tokenMatchesMobile = user.mobileSessionToken === token;

      // this.logger.debug('[Session Check] Platform from header: ' + platform);
      // this.logger.debug(
      //   '[Session Check] Token matches web: ' + tokenMatchesWeb,
      // );
      // this.logger.debug(
      //   '[Session Check] Token matches mobile: ' + tokenMatchesMobile,
      // );

      // Kiểm tra token chỉ match với platform của request
      if (platform === 'web' && !tokenMatchesWeb) {
        this.logger.warn(
          `[Session Mismatch] User ${phoneNumber} web token mismatch. Old token detected.`,
        );
        throw new UnauthorizedException(
          'Bạn đã đăng nhập ở thiết bị web khác. Phiên hiện tại đã hết hạn.',
        );
      }

      if (platform === 'mobile' && !tokenMatchesMobile) {
        this.logger.warn(
          `[Session Mismatch] User ${phoneNumber} mobile token mismatch. Old token detected.`,
        );
        throw new UnauthorizedException(
          'Bạn đã đăng nhập ở thiết bị mobile khác. Phiên hiện tại đã hết hạn.',
        );
      }

      // Gán thông tin người dùng vào request
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

      if (!payload.phoneNumber) {
        throw new Error('phoneNumber not found in token');
      }

      return payload.phoneNumber;
    } catch (error) {
      this.logger.error('Error extracting phone from token:', error);
      throw new UnauthorizedException('Token không hợp lệ');
    }
  }
}
