import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { Workspace } from '../../workspace/entities/workspace.entity';
import { User } from '../../users/entities/user.entity';
import { WorkspaceFileVersion } from './workspace-file-version.entity';

@Entity()
export class WorkspaceFile {
  @PrimaryGeneratedColumn('uuid')
  fileId: string;

  @Column()
  name: string;

  @Column({ default: 'file' })
  type: string; // file | folder

  @Column({ nullable: true })
  mimeType: string;

  @Column({ type: 'int', nullable: true })
  size: number;

  @Column({ nullable: true })
  url: string;

  @Column({ nullable: true })
  s3Key: string;

  @Column({ type: 'int', default: 1 })
  currentVersion: number;

  @Column({ default: 'workspace' })
  accessLevel: string; // workspace | admin_only | specific_users

  @CreateDateColumn()
  uploadedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  workspace: Workspace;

  @ManyToOne(() => User, { nullable: true, eager: true })
  uploadedBy: User;

  @ManyToOne(() => WorkspaceFile, { nullable: true, onDelete: 'CASCADE' })
  parent: WorkspaceFile | null;

  @OneToMany(() => WorkspaceFileVersion, (version) => version.file)
  versions: WorkspaceFileVersion[];
}
