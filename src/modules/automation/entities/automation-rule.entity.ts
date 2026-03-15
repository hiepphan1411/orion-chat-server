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

@Entity()
export class AutomationRule {
  @PrimaryGeneratedColumn('uuid')
  ruleId: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ default: true })
  isEnabled: boolean;

  @Column({ type: 'jsonb' })
  trigger: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  conditions: Record<string, unknown>;

  @Column({ type: 'jsonb' })
  action: Record<string, unknown>;

  @Column({ type: 'int', default: 0 })
  triggerCount: number;

  @Column({ type: 'timestamp', nullable: true })
  lastTriggered: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  workspace: Workspace;

  @ManyToOne(() => User, { eager: true })
  createdBy: User;
}
