import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { Workspace } from '../../workspace/entities/workspace.entity';
import { User } from '../../users/entities/user.entity';
import { KeyResult } from './key-result.entity';

@Entity()
export class Goal {
  @PrimaryGeneratedColumn('uuid')
  goalId: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ default: 'on_track' })
  status: string; // on_track | at_risk | behind | completed

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

  @OneToMany(() => KeyResult, (kr) => kr.goal, { cascade: true })
  keyResults: KeyResult[];
}
