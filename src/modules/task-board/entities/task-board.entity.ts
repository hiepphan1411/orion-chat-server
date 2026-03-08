import { WorkspaceRole } from 'src/common/enums/workspace-role.enum';
import { User } from 'src/modules/users/entities/user.entity';
import { Workspace } from 'src/modules/workspace/entities/workspace.entity';
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class TaskBoard {
  @PrimaryGeneratedColumn('uuid')
  boardId: string;

  @Column()
  boardName: string;

  @Column()
  backgroundColor: string;

  @Column()
  createdAt: Date;

  @ManyToOne(() => Workspace)
  workspace: Workspace;
}
