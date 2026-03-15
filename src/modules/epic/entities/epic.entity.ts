import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
} from 'typeorm';
import { Workspace } from '../../workspace/entities/workspace.entity';
import { User } from '../../users/entities/user.entity';
import { TaskBoard } from '../../task-board/entities/task-board.entity';

@Entity()
export class Epic {
  @PrimaryGeneratedColumn('uuid')
  epicId: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ default: 'planned' })
  status: string; // planned | in_progress | completed | blocked

  @Column({ default: '#3b82f6' })
  color: string;

  @Column({ type: 'int', default: 0 })
  progress: number;

  @Column({ type: 'date', nullable: true })
  startDate: string | null;

  @Column({ type: 'date', nullable: true })
  endDate: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  workspace: Workspace;

  @ManyToOne(() => User, { eager: true })
  owner: User;

  @ManyToOne(() => TaskBoard, { nullable: true, onDelete: 'SET NULL' })
  board: TaskBoard | null;
}
