import { Priority } from 'src/common/enums/priority.enum';
import { TaskStatus } from 'src/common/enums/task-status.enum';
import { WorkspaceRole } from 'src/common/enums/workspace-role.enum';
import { TaskBoard } from 'src/modules/task-board/entities/task-board.entity';
import { User } from 'src/modules/users/entities/user.entity';
import { Workspace } from 'src/modules/workspace/entities/workspace.entity';
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Task {
  @PrimaryGeneratedColumn('uuid')
  taskId: string;

  @Column()
  title: string;

  @Column()
  description: string;

  @Column({
    type: 'enum',
    enum: Priority,
  })
  priority: Priority;

  @Column({
    type: 'enum',
    enum: TaskStatus,
  })
  status: TaskStatus;

  @Column()
  dueDate: Date;

  @Column()
  startDate: Date;

  @Column()
  completedAt: Date;

  @ManyToOne(() => TaskBoard)
  board: TaskBoard;
}
