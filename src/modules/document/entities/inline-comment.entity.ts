import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { Document } from './document.entity';
import { User } from '../../users/entities/user.entity';

@Entity()
export class InlineComment {
  @PrimaryGeneratedColumn('uuid')
  inlineCommentId: string;

  @Column({ type: 'text' })
  selectedText: string;

  @Column({ type: 'text' })
  text: string;

  @Column({ default: false })
  isResolved: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Document, (d) => d.comments, { onDelete: 'CASCADE' })
  document: Document;

  @ManyToOne(() => User, { eager: true })
  author: User;

  @ManyToOne(() => InlineComment, { nullable: true, onDelete: 'CASCADE' })
  parentComment: InlineComment | null;

  @OneToMany(() => InlineComment, (c) => c.parentComment)
  replies: InlineComment[];
}
