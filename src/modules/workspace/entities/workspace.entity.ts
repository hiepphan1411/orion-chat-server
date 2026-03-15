import { WorkspaceType } from 'src/common/enums/workspace-type.enum';
import { File } from 'src/modules/file/entities/file.entity';
import { TaskBoard } from 'src/modules/task-board/entities/task-board.entity';
import { User } from 'src/modules/users/entities/user.entity';
import { WorkspaceMember } from 'src/modules/workspace-member/entities/workspace-member.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class Workspace {
  @PrimaryGeneratedColumn('uuid')
  workspaceId: string;

  @Column()
  workspaceName: string;

  @Column({ nullable: true })
  description: string;

  // bổ sung - loại workspace (business, education, community, personal)
  @Column({
    type: 'enum',
    enum: WorkspaceType,
    default: WorkspaceType.BUSINESS,
  })
  type: WorkspaceType;

  @Column({ nullable: true })
  avatarUrl: string;

  // bổ sung - màu chủ đạo của workspace
  @Column({ default: '#0d9488' })
  color: string;

  // bổ sung - workspace công khai hay riêng tư
  @Column({ default: false })
  isPublic: boolean;

  @Column({ default: 50 })
  memberLimit: number;

  @CreateDateColumn()
  createdAt: Date;

  // bổ sung - ngày cập nhật cuối
  @UpdateDateColumn()
  updatedAt: Date;

  // bổ sung - người sở hữu workspace
  @ManyToOne(() => User, { eager: true })
  owner: User;

  // bổ sung - danh sách thành viên (inverse relation)
  @OneToMany(() => WorkspaceMember, (member) => member.workspace)
  members: WorkspaceMember[];

  // bổ sung - danh sách boards (inverse relation)
  @OneToMany(() => TaskBoard, (board) => board.workspace)
  boards: TaskBoard[];

  @ManyToOne(() => File, { nullable: true })
  fileUser: File;
}
