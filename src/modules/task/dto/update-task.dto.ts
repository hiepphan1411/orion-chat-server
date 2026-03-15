import { PartialType } from '@nestjs/mapped-types';
import { CreateTaskDto } from './create-task.dto';

export class UpdateTaskDto extends PartialType(CreateTaskDto) {}

// bổ sung - DTO di chuyển task giữa các column
import { IsString, IsEnum, IsInt, IsOptional } from 'class-validator';
import { TaskStatus } from 'src/common/enums/task-status.enum';

export class MoveTaskDto {
  @IsString()
  columnId: string;

  @IsEnum(TaskStatus)
  status: TaskStatus;

  @IsOptional()
  @IsInt()
  order?: number;
}
