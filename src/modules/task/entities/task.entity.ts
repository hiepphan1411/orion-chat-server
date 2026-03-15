/* eslint-disable */
import { Priority } from 'src/common/enums/priority.enum';
import { TaskStatus } from 'src/common/enums/task-status.enum';
import { BoardColumn } from 'src/modules/board-column/entities/board-column.entity';
import { Label } from 'src/modules/label/entities/label.entity';
import { TaskBoard } from 'src/modules/task-board/entities/task-board.entity';
import { TaskAssignee } from 'src/modules/task/entities/task-assignee.entity';
import { User } from 'src/modules/users/entities/user.entity';
import { SubTask } from 'src/modules/sub-task/entities/sub-task.entity';
import { Comment } from 'src/modules/comment/entities/comment.entity';
import { Attachment } from 'src/modules/attachment/entities/attachment.entity';
import { ActivityLog } from 'src/modules/activity-log/entities/activity-log.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class Task {
  @PrimaryGeneratedColumn('uuid')
  taskId: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: Priority,
  })
  priority: Priority;

  @Column({
    type: 'enum',
    enum: TaskStatus,
  })
  status: TaskStatus;

  @Column({ type: 'int', default: 0 })
  order: number;

  @Column({ type: 'timestamp', nullable: true })
  startDate: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  dueDate: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => TaskBoard, { onDelete: 'CASCADE' })
  board: TaskBoard;

  @ManyToOne(() => BoardColumn, (col) => col.tasks, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  column: BoardColumn | null;

  @ManyToOne(() => User, { eager: true })
  createdBy: User;

  @OneToMany(() => TaskAssignee, (ta) => ta.task, { cascade: true })
  assignees: TaskAssignee[];

  @ManyToMany(() => Label)
  @JoinTable({ name: 'task_labels' })
  labels: Label[];

  @OneToMany(() => SubTask, (st) => st.task)
  subtasks: SubTask[];

  @OneToMany(() => Comment, (c) => c.task)
  comments: Comment[];

  @OneToMany(() => Attachment, (a) => a.task)
  attachments: Attachment[];

  @OneToMany(() => ActivityLog, (al) => al.task)
  activityLogs: ActivityLog[];
}
