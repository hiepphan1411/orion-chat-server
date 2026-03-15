import { IsString, IsOptional } from 'class-validator';

export class CreateTaskBoardDto {
  @IsString()
  boardName: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  backgroundColor?: string;

  @IsOptional()
  @IsString()
  icon?: string;
}
