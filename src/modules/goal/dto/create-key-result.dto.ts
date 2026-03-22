import { IsString, IsOptional, IsNumber } from 'class-validator';

export class CreateKeyResultDto {
  @IsString()
  title: string;

  @IsNumber()
  target: number;

  @IsOptional()
  @IsNumber()
  current?: number;

  @IsOptional()
  @IsString()
  unit?: string;
}
