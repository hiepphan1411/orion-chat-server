import {
  IsBoolean,
  IsOptional,
  IsString,
  IsInt,
  IsUUID,
  Min,
  Max,
} from 'class-validator';

export class CreateNotificationSettingsDto {
  @IsUUID()
  userId: string;

  @IsOptional()
  @IsBoolean()
  groupNotifications?: boolean;

  @IsOptional()
  @IsBoolean()
  tagNotifications?: boolean;

  @IsOptional()
  @IsBoolean()
  muteAll?: boolean;

  @IsOptional()
  @IsBoolean()
  messageNotifications?: boolean;

  @IsOptional()
  @IsBoolean()
  friendRequestNotifications?: boolean;

  @IsOptional()
  @IsBoolean()
  callNotifications?: boolean;

  @IsOptional()
  @IsString()
  notificationSound?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  doNotDisturbStart?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  doNotDisturbEnd?: number;
}

export class UpdateNotificationSettingsDto {
  @IsOptional()
  @IsBoolean()
  groupNotifications?: boolean;

  @IsOptional()
  @IsBoolean()
  tagNotifications?: boolean;

  @IsOptional()
  @IsBoolean()
  muteAll?: boolean;

  @IsOptional()
  @IsBoolean()
  messageNotifications?: boolean;

  @IsOptional()
  @IsBoolean()
  friendRequestNotifications?: boolean;

  @IsOptional()
  @IsBoolean()
  callNotifications?: boolean;

  @IsOptional()
  @IsString()
  notificationSound?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  doNotDisturbStart?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  doNotDisturbEnd?: number;
}

export class NotificationSettingsResponseDto {
  id: string;
  userId: string;
  groupNotifications: boolean;
  tagNotifications: boolean;
  muteAll: boolean;
  messageNotifications: boolean;
  friendRequestNotifications: boolean;
  callNotifications: boolean;
  notificationSound: string;
  doNotDisturbStart: number;
  doNotDisturbEnd: number;
  createdAt: Date;
  updatedAt: Date;
}
