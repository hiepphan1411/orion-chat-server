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
export class Attachment {
  @PrimaryGeneratedColumn('uuid')
  attachmentId: string;

  @Column()
  fileName: string;

  @Column()
  fileUrl: string;

  @Column()
  fileType: string;

  @Column({ type: 'int' })
  fileSize: number;

  @CreateDateColumn()
  uploadedAt: Date;

  @ManyToOne(() => Task, (t) => t.attachments, { onDelete: 'CASCADE' })
  task: Task;

  @ManyToOne(() => User, { eager: true })
  uploadedBy: User;
}
