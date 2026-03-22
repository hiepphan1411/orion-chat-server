import { IsString, IsOptional } from 'class-validator';

export class CreateMilestoneDto {
  @IsString()
  title: string;

  @IsString()
  date: string;

  @IsString()
  @IsOptional()
  status?: string;
}
