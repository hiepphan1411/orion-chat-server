import { IsString, IsNotEmpty } from 'class-validator';

export class SendOtpDto {
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;
  // password: string;
}
