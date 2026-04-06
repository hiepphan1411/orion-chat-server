import { IsString, IsInt, IsOptional, Min, Max, IsUUID } from 'class-validator';

export class CreateUserSettingsDto {
  @IsUUID()
  userId: string;

  @IsOptional()
  @IsString()
  theme?: string;

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
}

export class UpdateUserSettingsDto {
  @IsOptional()
  @IsString()
  theme?: string;

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
}

export class UserSettingsResponseDto {
  id: string;
  userId: string;
  theme: string;
  fontSize: number;
  wallpaper: string;
  fontFamily: string;
  accentColor: string;
  createdAt: Date;
  updatedAt: Date;
}
