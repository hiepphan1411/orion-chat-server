import {
  Entity,
  Column,
  OneToOne,
  JoinColumn,
  PrimaryColumn,
  ManyToOne,
} from 'typeorm';
import { Conversation } from './conversation.schema';
import { User } from '../../users/entities/user.entity';

@Entity('group_conversation')
export class GroupConversation {
  @PrimaryColumn('uuid')
  conversationId: string;

  @OneToOne(() => Conversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  conversation: Conversation;

  @Column()
  groupName: string;

  @Column({ nullable: true })
  groupAvatar: string;

  @Column('uuid')
  ownerId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'ownerId' })
  owner: User;
}
