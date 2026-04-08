import { GroupConversation } from '../../conversation/entities/group-conversation.entity';
import { User } from 'src/modules/users/entities/user.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum GroupInviteStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
  REVOKED = 'revoked',
}

@Entity('group_invite')
@Index(['group', 'invitee', 'status'])
export class GroupInvite {
  @PrimaryGeneratedColumn('uuid')
  inviteId!: string;

  @ManyToOne(() => GroupConversation, (group) => group.invites, {
    eager: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'groupConversationId',
    referencedColumnName: 'conversationId',
  })
  group!: GroupConversation;

  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  inviter!: User;

  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  invitee!: User;

  @Column({
    type: 'enum',
    enum: GroupInviteStatus,
    default: GroupInviteStatus.PENDING,
  })
  status!: GroupInviteStatus;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  respondedAt!: Date | null;
}
