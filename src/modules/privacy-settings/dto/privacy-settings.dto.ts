import { IsOptional, IsBoolean, IsUUID, IsEnum, IsIn } from 'class-validator';
import {
  ContactPermission,
  ProfileVisibility,
} from '../privacy-settings.constants';

export class CreatePrivacySettingsDto {
  @IsUUID()
  userId: string;

  @IsOptional()
  @IsEnum(ProfileVisibility)
  profileVisibility?: ProfileVisibility;

  @IsOptional()
  @IsIn([
    ContactPermission.EVERYONE,
    ContactPermission.FRIENDS,
    ContactPermission.NOBODY,
    'none',
  ])
  messagePermission?: ContactPermission | 'none';

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
  @IsIn([
    ContactPermission.EVERYONE,
    ContactPermission.FRIENDS,
    ContactPermission.NOBODY,
    'none',
  ])
  callPermission?: ContactPermission | 'none';

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
  @IsEnum(ProfileVisibility)
  profileVisibility?: ProfileVisibility;

  @IsOptional()
  @IsIn([
    ContactPermission.EVERYONE,
    ContactPermission.FRIENDS,
    ContactPermission.NOBODY,
    'none',
  ])
  messagePermission?: ContactPermission | 'none';

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
  @IsIn([
    ContactPermission.EVERYONE,
    ContactPermission.FRIENDS,
    ContactPermission.NOBODY,
    'none',
  ])
  callPermission?: ContactPermission | 'none';

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
