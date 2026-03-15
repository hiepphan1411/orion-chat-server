import { Task } from 'src/modules/task/entities/task.entity';
import { User } from 'src/modules/users/entities/user.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class Comment {
  @PrimaryGeneratedColumn('uuid')
  commentId: string;

  @Column({ type: 'text' })
  content: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Task, (t) => t.comments, { onDelete: 'CASCADE' })
  task: Task;

  @ManyToOne(() => User, { eager: true })
  author: User;
}
