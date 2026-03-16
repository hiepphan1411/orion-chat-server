import { IsString, IsNotEmpty } from 'class-validator';

export class SendOTPForgetPasswordDto {
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;
}
