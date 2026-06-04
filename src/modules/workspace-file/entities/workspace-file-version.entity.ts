import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { WorkspaceFile } from './workspace-file.entity';

@Entity()
export class WorkspaceFileVersion {
  @PrimaryGeneratedColumn('uuid')
  versionId: string;

  @Column({ type: 'int' })
  version: number;

  @Column()
  s3Key: string;

  @Column()
  url: string;

  @Column({ nullable: true })
  mimeType: string;

  @Column({ type: 'int', nullable: true })
  size: number;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => WorkspaceFile, (file) => file.versions, {
    onDelete: 'CASCADE',
  })
  file: WorkspaceFile;

  @ManyToOne(() => User, { nullable: true, eager: true })
  editedBy: User | null;
}
