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
import { VerifyOtpForgetPasswordDto } from './dto/verify-otp-forget-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtSessionGuard } from './guards/jwt-session.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

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
  login(@Body() body: LoginDto) {
    return this.authService.login(
      body.phoneNumber,
      body.password,
      body.platform,
    );
  }

  @Post('logout')
  @UseGuards(JwtSessionGuard)
  logout(
    @Request() req: { user: { phoneNumber: string } },
    @Body() body?: { platform?: string },
  ) {
    return this.authService.logout(req.user.phoneNumber, body?.platform);
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
