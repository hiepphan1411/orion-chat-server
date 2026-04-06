import {
  IsString,
  IsOptional,
  IsBoolean,
  IsUUID,
  IsDateString,
} from 'class-validator';

export class CreateUserDevicesDto {
  @IsUUID()
  userId: string;

  @IsString()
  deviceName: string;

  @IsString()
  deviceType: string; // mobile, web, tablet

  @IsOptional()
  @IsString()
  deviceModel?: string;

  @IsOptional()
  @IsString()
  osType?: string;

  @IsOptional()
  @IsString()
  osVersion?: string;

  @IsOptional()
  @IsString()
  appVersion?: string;

  @IsString()
  refreshToken: string;

  @IsOptional()
  @IsString()
  fcmToken?: string;

  @IsOptional()
  @IsString()
  ipAddress?: string;
}

export class UpdateUserDevicesDto {
  @IsOptional()
  @IsString()
  deviceName?: string;

  @IsOptional()
  @IsString()
  deviceModel?: string;

  @IsOptional()
  @IsString()
  osVersion?: string;

  @IsOptional()
  @IsString()
  appVersion?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  fcmToken?: string;
}

export class UserDevicesResponseDto {
  id: string;
  userId: string;
  deviceName: string;
  deviceType: string;
  deviceModel: string;
  osType: string;
  osVersion: string;
  appVersion: string;
  lastLogin: Date;
  isActive: boolean;
  fcmToken: string;
  ipAddress: string;
  createdAt: Date;
}
