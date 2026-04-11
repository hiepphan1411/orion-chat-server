import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  OneToOne,
  Index,
} from 'typeorm';
import { ConversationParticipant } from './conversation-participant.entity';
import { GroupConversation } from './group-conversation.entity';
import { Report } from 'src/modules/reports/entities/reports.entity';

export enum ConversationType {
  PRIVATE = 'PRIVATE',
  GROUP = 'GROUP',
}

@Entity('conversation')
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  conversationId: string;

  @Column({
    type: 'enum',
    enum: ConversationType,
    default: ConversationType.PRIVATE,
  })
  @Index()
  type: ConversationType;

  @Column({ type: 'int', default: 0 })
  autoDeleteDuration: number;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => ConversationParticipant, (p) => p.conversation, {
    cascade: ['insert'],
  })
  participants: ConversationParticipant[];

  @OneToOne(() => GroupConversation, (g) => g.conversation)
  groupInfo?: GroupConversation;

  @OneToMany(() => Report, (report) => report.conversation)
  reports: Report[];
}
