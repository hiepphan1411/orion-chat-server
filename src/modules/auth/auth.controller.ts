import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { CompleteRegisterDto } from './dto/complete-register.dto';
import { LoginDto } from './dto/login.dto';
import { SendOTPForgetPasswordDto } from './dto/send-otp-forget-password.dto';

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
    return this.authService.login(body.phoneNumber, body.password);
  }
}
