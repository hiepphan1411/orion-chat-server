import { IsString, IsEnum, IsOptional, IsInt } from 'class-validator';
import { TaskStatus } from 'src/common/enums/task-status.enum';

export class CreateBoardColumnDto {
  @IsString()
  name: string;

  @IsEnum(TaskStatus)
  status: TaskStatus;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsInt()
  taskLimit?: number;
}
