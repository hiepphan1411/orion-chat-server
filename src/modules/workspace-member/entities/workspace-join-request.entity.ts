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

export enum WorkspaceJoinRequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

@Entity()
export class WorkspaceJoinRequest {
  @PrimaryGeneratedColumn('uuid')
  requestId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  workspace: Workspace;

  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  user: User;

  @Column({
    type: 'enum',
    enum: WorkspaceRole,
    default: WorkspaceRole.MEMBER,
  })
  requestedRole: WorkspaceRole;

  @Column({
    type: 'enum',
    enum: WorkspaceJoinRequestStatus,
    default: WorkspaceJoinRequestStatus.PENDING,
  })
  status: WorkspaceJoinRequestStatus;

  @ManyToOne(() => User, { nullable: true })
  reviewedBy: User | null;

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt: Date | null;

  @CreateDateColumn()
  requestedAt: Date;
}
