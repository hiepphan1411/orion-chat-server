import { IsString, IsOptional, IsInt, IsUUID, Min, Max } from 'class-validator';

export class CreateEpicDto {
  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  color?: string;

  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  progress?: number;

  @IsString()
  @IsOptional()
  startDate?: string;

  @IsString()
  @IsOptional()
  endDate?: string;

  @IsUUID()
  ownerId: string;

  @IsUUID()
  @IsOptional()
  boardId?: string;
}
