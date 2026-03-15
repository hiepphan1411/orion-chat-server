import { WorkspaceRole } from 'src/common/enums/workspace-role.enum';
import { User } from 'src/modules/users/entities/user.entity';
import { Workspace } from 'src/modules/workspace/entities/workspace.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity()
export class WorkspaceMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // bổ sung - thêm inverse relation để workspace.members hoạt động
  @ManyToOne(() => Workspace, (workspace) => workspace.members, {
    onDelete: 'CASCADE',
  })
  workspace: Workspace;

  @ManyToOne(() => User, { eager: true })
  user: User;

  @Column({
    type: 'enum',
    enum: WorkspaceRole,
  })
  role: WorkspaceRole;

  @CreateDateColumn()
  joinedAt: Date;
}
