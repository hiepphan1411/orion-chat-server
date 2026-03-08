import { WorkspaceRole } from 'src/common/enums/workspace-role.enum';
import { Task } from 'src/modules/task/entities/task.entity';
import { User } from 'src/modules/users/entities/user.entity';
import { Workspace } from 'src/modules/workspace/entities/workspace.entity';
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class TaskList {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Task)
  task: Task;

  @ManyToOne(() => User)
  user: User;

  @Column({ default: false })
  isSeen: boolean;
}
