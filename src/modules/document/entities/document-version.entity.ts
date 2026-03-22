import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
} from 'typeorm';
import { Document } from './document.entity';
import { User } from '../../users/entities/user.entity';

@Entity()
export class DocumentVersion {
  @PrimaryGeneratedColumn('uuid')
  versionId: string;

  @Column({ nullable: true })
  name: string;

  @Column({ type: 'text' })
  content: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Document, (d) => d.versions, { onDelete: 'CASCADE' })
  document: Document;

  @ManyToOne(() => User, { eager: true })
  editedBy: User;
}
