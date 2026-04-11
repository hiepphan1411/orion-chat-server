import { IsString, IsNotEmpty } from 'class-validator';

export class VerifyOtpForgetPasswordDto {
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @IsString()
  @IsNotEmpty()
  otp: string;
}
