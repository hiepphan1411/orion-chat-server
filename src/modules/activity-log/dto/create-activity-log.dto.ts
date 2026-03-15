import { IsString, IsOptional, IsObject } from 'class-validator';

export class CreateActivityLogDto {
  @IsString()
  action: string;

  @IsString()
  description: string;

  @IsString()
  userId: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
