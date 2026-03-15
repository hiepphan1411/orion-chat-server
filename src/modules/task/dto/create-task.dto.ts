import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsArray,
} from 'class-validator';
import { Priority } from 'src/common/enums/priority.enum';
import { TaskStatus } from 'src/common/enums/task-status.enum';

export class CreateTaskDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(Priority)
  priority: Priority;

  @IsEnum(TaskStatus)
  status: TaskStatus;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  boardId?: string;

  @IsOptional()
  @IsString()
  columnId?: string;

  @IsString()
  createdById: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assigneeIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labelIds?: string[];
}
