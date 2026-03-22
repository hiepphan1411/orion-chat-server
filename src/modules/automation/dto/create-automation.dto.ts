import { IsString, IsOptional, IsObject } from 'class-validator';

export class CreateAutomationDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsObject()
  trigger: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown>;

  @IsObject()
  action: Record<string, unknown>;
}
