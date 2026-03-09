import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  Index,
  Unique,
} from 'typeorm';
import { User } from 'src/modules/users/entities/user.entity';
import { PersonalNote } from './note.entity';

@Entity('note_categories')
@Unique(['userId', 'name'])
export class NoteCategory {
  @PrimaryGeneratedColumn('uuid')
  categoryId: string;

  @Column({ type: 'varchar', length: 50 })
  @Index()
  name: string;

  @Column({ type: 'varchar', length: 7, default: '#3B82F6' })
  color: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  icon: string | null;

  @Column({ type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @OneToMany(() => PersonalNote, (note) => note.category, {
    cascade: false,
  })
  notes: PersonalNote[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
