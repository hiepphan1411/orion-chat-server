import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Get,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { CompleteRegisterDto } from './dto/complete-register.dto';
import { LoginDto } from './dto/login.dto';
import { SendOTPForgetPasswordDto } from './dto/send-otp-forget-password.dto';
import { VerifyOtpForgetPasswordDto } from './dto/verify-otp-forget-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtSessionGuard } from './guards/jwt-session.guard';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger('AuthController');

  constructor(
    private authService: AuthService,
    private jwtService: JwtService,
  ) {}

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

  @Post('verify-otp-forget-password')
  verifyOtpForgetPassword(@Body() body: VerifyOtpForgetPasswordDto) {
    return this.authService.verifyOtpForgetPassword(body.phoneNumber, body.otp);
  }

  @Post('reset-password')
  resetPassword(@Body() body: ResetPasswordDto) {
    return this.authService.resetPassword(body);
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
    const platformHeader =
      this.toHeaderString(req.headers['x-platform']) || 'web';

    const maybePlatform =
      typeof (body as unknown as { platform?: unknown }).platform === 'string'
        ? (body as unknown as { platform: string }).platform
        : undefined;

    this.logger.log(
      `[Login Controller] Full request body: ${JSON.stringify(body)}`,
    );
    this.logger.log(
      `[Login Controller] x-platform header: ${platformHeader} | body.deviceType: ${body.deviceType} | body.platform: ${maybePlatform}`,
    );
    this.logger.log(
      `[Login Controller] phoneNumber: ${body.phoneNumber} | hasPassword: ${Boolean(body.password)}`,
    );

    const browserFromBody =
      body.deviceModel || body.deviceName?.split(' on ')[0];
    const resolvedBrowser = this.detectBrowserFromHeaders(
      secChUa,
      userAgent,
      browserFromBody,
    );
    const resolvedOs = body.osType || 'Unknown OS';

    // Use deviceType from body if available, otherwise use X-Platform header
    const deviceType = body.deviceType || platformHeader;

    return this.authService.login(body.phoneNumber, body.password, {
      deviceName: `${resolvedBrowser} on ${resolvedOs}`,
      deviceType: deviceType,
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
  logout(
    @Request() req: { user: { phoneNumber: string; userId: string } },
    @Body() body?: { platform?: string },
  ) {
    return this.authService.logout(req.user.userId, body?.platform);
  }

  @Post('logout-with-token')
  logoutWithToken(@Body() body: { token: string; platform?: string }) {
    // Verify token without throwing error, extract userId
    try {
      /**eslint-disable-next-line */
      const decoded = this.jwtService.verify<{ userId: string }>(body.token);
      return this.authService.logout(decoded.userId, body?.platform);
    } catch (error) {
      this.logger.warn('Invalid token in logout-with-token:', error);
      throw new BadRequestException('Token không hợp lệ');
    }
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
