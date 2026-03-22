import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
} from 'typeorm';
import { Goal } from './goal.entity';

@Entity()
export class KeyResult {
  @PrimaryGeneratedColumn('uuid')
  keyResultId: string;

  @Column()
  title: string;

  @Column({ type: 'float', default: 0 })
  target: number;

  @Column({ type: 'float', default: 0 })
  current: number;

  @Column({ default: '' })
  unit: string;

  @Column({ type: 'int', default: 0 })
  linkedTaskCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Goal, (g) => g.keyResults, { onDelete: 'CASCADE' })
  goal: Goal;
}
