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

      // Gán thông tin người dùng vào request
      // JWT token validity sẽ được kiểm tra bởi @UseGuards(JwtAuthGuard)
      // Logout sẽ chỉ xảy ra khi token hết hạn (exp claim)
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
