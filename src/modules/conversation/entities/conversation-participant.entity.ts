import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  PrimaryColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { Conversation } from './conversation.schema';
import { User } from '../../users/entities/user.entity';

export enum ParticipantRole {
  ADMIN = 'admin',
  MEMBER = 'member',
}

@Entity('conversation_participants')
@Index(['conversationId', 'userId'], { unique: true })
export class ConversationParticipant {
  @PrimaryColumn('uuid')
  conversationId: string;

  @PrimaryColumn('uuid')
  userId: string;

  @ManyToOne(() => Conversation, (c) => c.participants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  conversation: Conversation;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({
    type: 'enum',
    enum: ParticipantRole,
    default: ParticipantRole.MEMBER,
  })
  role: ParticipantRole;

  @CreateDateColumn()
  joinedAt: Date;

  @Column({ type: 'varchar', nullable: true })
  lastReadMessageId: string | null;
}
