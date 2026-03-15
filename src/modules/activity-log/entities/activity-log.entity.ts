import { Task } from 'src/modules/task/entities/task.entity';
import { User } from 'src/modules/users/entities/user.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity()
export class ActivityLog {
  @PrimaryGeneratedColumn('uuid')
  activityId: string;

  @Column()
  action: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown>;

  @CreateDateColumn()
  timestamp: Date;

  @ManyToOne(() => Task, (t) => t.activityLogs, { onDelete: 'CASCADE' })
  task: Task;

  @ManyToOne(() => User, { eager: true })
  user: User;
}
