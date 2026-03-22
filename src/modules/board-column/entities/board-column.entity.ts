import { TaskStatus } from 'src/common/enums/task-status.enum';
import { Task } from 'src/modules/task/entities/task.entity';
import { TaskBoard } from 'src/modules/task-board/entities/task-board.entity';
import {
  Column,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity()
export class BoardColumn {
  @PrimaryGeneratedColumn('uuid')
  columnId: string;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: TaskStatus })
  status: TaskStatus;

  @Column({ default: '#94a3b8' })
  color: string;

  @Column({ type: 'int' })
  order: number;

  @Column({ nullable: true, type: 'int' })
  taskLimit: number;

  @ManyToOne(() => TaskBoard, (board) => board.columns, { onDelete: 'CASCADE' })
  board: TaskBoard;

  @OneToMany(() => Task, (task) => task.column)
  tasks: Task[];
}
