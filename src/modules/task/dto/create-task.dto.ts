import { Priority } from 'src/common/enums/priority.enum';
import { TaskStatus } from 'src/common/enums/task-status.enum';

export class CreateTaskDto {
  title: string;

  description: string;

  priority: Priority;

  status: TaskStatus;

  dueDate: Date;

  startDate: Date;

  boardId: string;
}
