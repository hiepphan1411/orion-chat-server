import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { Workspace } from '../../workspace/entities/workspace.entity';
import { User } from '../../users/entities/user.entity';
import { DocumentVersion } from './document-version.entity';
import { InlineComment } from './inline-comment.entity';

@Entity()
export class Document {
  @PrimaryGeneratedColumn('uuid')
  documentId: string;

  @Column()
  title: string;

  @Column({ type: 'text', default: '' })
  content: string;

  @Column({ default: false })
  isFavorite: boolean;

  @Column({ type: 'int', default: 0 })
  viewCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  workspace: Workspace;

  @ManyToOne(() => User, { eager: true })
  createdBy: User;

  @ManyToOne(() => User, { eager: true })
  lastEditedBy: User;

  @OneToMany(() => DocumentVersion, (v) => v.document, { cascade: true })
  versions: DocumentVersion[];

  @OneToMany(() => InlineComment, (c) => c.document, { cascade: true })
  comments: InlineComment[];
}
