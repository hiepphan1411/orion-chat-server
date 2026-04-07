import { IsString, IsOptional, IsBoolean, IsUUID } from 'class-validator';

export class CreatePrivacySettingsDto {
  @IsUUID()
  userId: string;

  @IsOptional()
  @IsString()
  profileVisibility?: string;

  @IsOptional()
  @IsString()
  messagePermission?: string;

  @IsOptional()
  @IsBoolean()
  lastSeenVisibility?: boolean;

  @IsOptional()
  @IsBoolean()
  onlineStatusVisibility?: boolean;

  @IsOptional()
  @IsBoolean()
  allowAIToSeeProfile?: boolean;

  @IsOptional()
  @IsBoolean()
  allowAIToSeeMessages?: boolean;

  @IsOptional()
  @IsBoolean()
  allowAIToSeeMedia?: boolean;

  @IsOptional()
  @IsString()
  callPermission?: string;

  @IsOptional()
  @IsBoolean()
  allowScreenSharing?: boolean;

  @IsOptional()
  @IsBoolean()
  allowDataCollection?: boolean;

  @IsOptional()
  @IsBoolean()
  allowAnalytics?: boolean;
}

export class UpdatePrivacySettingsDto {
  @IsOptional()
  @IsString()
  profileVisibility?: string;

  @IsOptional()
  @IsString()
  messagePermission?: string;

  @IsOptional()
  @IsBoolean()
  lastSeenVisibility?: boolean;

  @IsOptional()
  @IsBoolean()
  onlineStatusVisibility?: boolean;

  @IsOptional()
  @IsBoolean()
  allowAIToSeeProfile?: boolean;

  @IsOptional()
  @IsBoolean()
  allowAIToSeeMessages?: boolean;

  @IsOptional()
  @IsBoolean()
  allowAIToSeeMedia?: boolean;

  @IsOptional()
  @IsString()
  callPermission?: string;

  @IsOptional()
  @IsBoolean()
  allowScreenSharing?: boolean;

  @IsOptional()
  @IsBoolean()
  allowDataCollection?: boolean;

  @IsOptional()
  @IsBoolean()
  allowAnalytics?: boolean;
}

export class PrivacySettingsResponseDto {
  id: string;
  userId: string;
  profileVisibility: string;
  messagePermission: string;
  lastSeenVisibility: boolean;
  onlineStatusVisibility: boolean;
  allowAIToSeeProfile: boolean;
  allowAIToSeeMessages: boolean;
  allowAIToSeeMedia: boolean;
  callPermission: string;
  allowScreenSharing: boolean;
  allowDataCollection: boolean;
  allowAnalytics: boolean;
  createdAt: Date;
  updatedAt: Date;
}
