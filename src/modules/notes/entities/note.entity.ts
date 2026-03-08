import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { User } from 'src/modules/users/entities/user.entity';
import { NoteCategory } from './note-category.entity';

@Entity('personal_notes')
export class PersonalNote {
  @PrimaryGeneratedColumn('uuid')
  noteId: string;

  @Column({ type: 'varchar', length: 255 })
  @Index()
  title: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ name: 'category_id', type: 'uuid' })
  @Index()
  categoryId: string;

  @ManyToOne(() => NoteCategory, (category) => category.notes, {
    onDelete: 'RESTRICT',
    eager: true,
  })
  @JoinColumn({ name: 'category_id' })
  category: NoteCategory;

  @Column({ type: 'boolean', default: false })
  @Index()
  isPinned: boolean;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
