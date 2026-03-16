import { IsString, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

export class CompleteRegisterDto {
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  @IsString()
  @IsNotEmpty()
  fullName: string;

  @Type(() => Date)
  birthDate: Date;

  @IsString()
  @IsNotEmpty()
  gender: string;
}
