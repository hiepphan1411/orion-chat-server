import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Get,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { CompleteRegisterDto } from './dto/complete-register.dto';
import { LoginDto } from './dto/login.dto';
import { SendOTPForgetPasswordDto } from './dto/send-otp-forget-password.dto';
import { JwtSessionGuard } from './guards/jwt-session.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  private toHeaderString(value: string | string[] | undefined): string {
    if (!value) return '';
    return Array.isArray(value) ? value.join(', ') : value;
  }

  private detectBrowserFromHeaders(
    secChUa: string,
    userAgent: string,
    fallback?: string,
  ): string {
    const source = `${secChUa} ${userAgent}`.toLowerCase();

    if (/(coc\s*coc|coccoc|coc_coc|coc_coc_browser|cocbrowser)/i.test(source)) {
      return 'Coc Coc';
    }

    if (/edg\//i.test(source)) return 'Microsoft Edge';
    if (/firefox\//i.test(source)) return 'Mozilla Firefox';
    if (/safari\//i.test(source) && !/chrome\//i.test(source)) return 'Safari';
    if (/chrome\//i.test(source) || /chromium/i.test(source)) {
      return fallback === 'Coc Coc' ? 'Coc Coc' : 'Google Chrome';
    }

    return fallback || 'Web Browser';
  }

  @Post('send-otp')
  sendOtp(@Body() body: SendOtpDto) {
    return this.authService.sendOtp(body.phoneNumber);
  }

  @Post('send-otp-forget-password')
  sendOtpForgetPassword(@Body() body: SendOTPForgetPasswordDto) {
    return this.authService.sendOtpForgetPassword(body.phoneNumber);
  }

  @Post('verify-otp')
  verifyOtp(@Body() body: VerifyOtpDto) {
    return this.authService.verifyOtp(body.phoneNumber, body.otp);
  }

  @Post('complete-register')
  completeRegister(@Body() body: CompleteRegisterDto) {
    return this.authService.completeRegister(body);
  }

  @Post('login')
  login(
    @Body() body: LoginDto,
    @Request()
    req: {
      headers: Record<string, string | string[] | undefined>;
      ip?: string;
    },
  ) {
    const forwardedFor = req.headers['x-forwarded-for'];
    const forwardedIp = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor?.split(',')[0]?.trim();

    const secChUa = this.toHeaderString(req.headers['sec-ch-ua']);
    const userAgent = this.toHeaderString(req.headers['user-agent']);

    const browserFromBody = body.deviceModel || body.deviceName?.split(' on ')[0];
    const resolvedBrowser = this.detectBrowserFromHeaders(
      secChUa,
      userAgent,
      browserFromBody,
    );
    const resolvedOs = body.osType || 'Unknown OS';

    return this.authService.login(body.phoneNumber, body.password, {
      deviceName: `${resolvedBrowser} on ${resolvedOs}`,
      deviceType: body.deviceType,
      deviceModel: resolvedBrowser,
      osType: resolvedOs,
      osVersion: body.osVersion,
      appVersion: body.appVersion,
      fcmToken: body.fcmToken,
      ipAddress: body.ipAddress || forwardedIp || req.ip,
    });
  }

  @Post('logout')
  @UseGuards(JwtSessionGuard)
  logout(@Request() req: { user: { phoneNumber: string } }) {
    return this.authService.logout(req.user.phoneNumber);
  }

  @Get('verify-token')
  @UseGuards(JwtSessionGuard)
  verifyToken(
    @Request() req: { user: { phoneNumber: string; userId: string } },
  ) {
    return {
      success: true,
      message: 'Token hợp lệ',
      data: {
        phoneNumber: req.user.phoneNumber,
        userId: req.user.userId,
      },
      timestamp: new Date().toISOString(),
    };
  }
}
