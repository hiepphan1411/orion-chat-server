import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CreateUserSettingsDto {
  @IsUUID()
  userId: string;

  @IsOptional()
  @IsString()
  theme?: string;

  @IsOptional()
  @IsString()
  appearanceColor?: string;

  @IsOptional()
  @IsInt()
  @Min(12)
  @Max(24)
  fontSize?: number;

  @IsOptional()
  @IsString()
  wallpaper?: string;

  @IsOptional()
  @IsString()
  fontFamily?: string;

  @IsOptional()
  @IsString()
  accentColor?: string;

  @IsOptional()
  @IsBoolean()
  smartEmotionDetection?: boolean;

  @IsOptional()
  @IsBoolean()
  autoWorkflowSuggestions?: boolean;

  @IsOptional()
  @IsBoolean()
  aiMemoryEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enabledAgents?: string[];
}

export class UpdateUserSettingsDto {
  @IsOptional()
  @IsString()
  theme?: string;

  @IsOptional()
  @IsString()
  appearanceColor?: string;

  @IsOptional()
  @IsInt()
  @Min(12)
  @Max(24)
  fontSize?: number;

  @IsOptional()
  @IsString()
  wallpaper?: string;

  @IsOptional()
  @IsString()
  fontFamily?: string;

  @IsOptional()
  @IsString()
  accentColor?: string;

  @IsOptional()
  @IsBoolean()
  smartEmotionDetection?: boolean;

  @IsOptional()
  @IsBoolean()
  autoWorkflowSuggestions?: boolean;

  @IsOptional()
  @IsBoolean()
  aiMemoryEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enabledAgents?: string[];
}

export class UserSettingsResponseDto {
  id: string;
  userId: string;
  theme: string;
  appearanceColor: string;
  fontSize: number;
  wallpaper: string;
  fontFamily: string;
  accentColor: string;
  smartEmotionDetection: boolean;
  autoWorkflowSuggestions: boolean;
  aiMemoryEnabled: boolean;
  enabledAgents: string[];
  createdAt: Date;
  updatedAt: Date;
}
