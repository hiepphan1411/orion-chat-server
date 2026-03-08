import { WorkspaceRole } from 'src/common/enums/workspace-role.enum';
import { User } from 'src/modules/users/entities/user.entity';
import { Workspace } from 'src/modules/workspace/entities/workspace.entity';
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class WorkspaceMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Workspace)
  workspace: Workspace;

  @ManyToOne(() => User)
  user: User;

  @Column({
    type: 'enum',
    enum: WorkspaceRole,
  })
  role: WorkspaceRole;

  @Column()
  joinedAt: Date;
}
