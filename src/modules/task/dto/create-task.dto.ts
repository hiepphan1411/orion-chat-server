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

  @IsString()
  boardId: string;

  // bổ sung - column chứa task
  @IsOptional()
  @IsString()
  columnId?: string;

  // bổ sung - người tạo task
  @IsString()
  createdById: string;

  // bổ sung - danh sách userId được giao task
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assigneeIds?: string[];

  // bổ sung - danh sách labelId gắn vào task
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labelIds?: string[];
}
