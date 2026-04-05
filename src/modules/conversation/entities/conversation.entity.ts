import { Report } from 'src/modules/reports/entities/reports.entity';
import {
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  TableInheritance,
} from 'typeorm';

@Entity()
@TableInheritance({ column: { type: 'varchar', name: 'type', nullable: true } })
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  conversationId: string;

  @Column()
  createdAt: Date;

  @Column({ type: 'varchar', nullable: true })
  lastMessageId: string | null;

  @OneToMany(() => Report, (report) => report.conversation)
  reports: Report[];
}
