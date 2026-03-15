import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
} from 'typeorm';
import { Workspace } from '../../workspace/entities/workspace.entity';

@Entity()
export class Milestone {
  @PrimaryGeneratedColumn('uuid')
  milestoneId: string;

  @Column()
  title: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ default: 'upcoming' })
  status: string; // reached | upcoming | missed

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  workspace: Workspace;
}
