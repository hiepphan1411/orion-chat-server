import { IsString, IsOptional, IsEnum, IsDateString } from 'class-validator';
import { TaskStatus } from 'src/common/enums/task-status.enum';

export class CreateSubTaskDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsString()
  parentSubTaskId?: string;

  @IsOptional()
  @IsString()
  assigneeId?: string;

  @IsOptional()
  @IsDateString()
  deadline?: string;
}
