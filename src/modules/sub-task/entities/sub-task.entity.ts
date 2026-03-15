import { TaskStatus } from 'src/common/enums/task-status.enum';
import { Task } from 'src/modules/task/entities/task.entity';
import { User } from 'src/modules/users/entities/user.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class SubTask {
  @PrimaryGeneratedColumn('uuid')
  subTaskId: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'enum', enum: TaskStatus, default: TaskStatus.TODO })
  status: TaskStatus;

  @Column({ type: 'int', default: 0 })
  order: number;

  @Column({ type: 'timestamp', nullable: true })
  deadline: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Task, (t) => t.subtasks, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  task: Task | null;

  @ManyToOne(() => SubTask, (st) => st.children, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  parent: SubTask | null;

  @OneToMany(() => SubTask, (st) => st.parent, { cascade: true })
  children: SubTask[];

  @ManyToOne(() => User, { eager: true, nullable: true })
  assignee: User | null;
}
