import {
  Entity,
  Column,
  OneToOne,
  JoinColumn,
  PrimaryColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { Conversation } from './conversation.schema';
import { User } from '../../users/entities/user.entity';
import { GroupMember } from 'src/modules/group-member/entities/group-member.entity';
import { GroupInvite } from 'src/modules/group-invite/entities/group-invite.entity';

@Entity('group_conversation')
export class GroupConversation {
  @PrimaryColumn('uuid')
  conversationId!: string;

  @OneToOne(() => Conversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  conversation!: Conversation;

  @Column()
  groupName!: string;

  @Column({ nullable: true })
  groupAvatar!: string;

  @Column('uuid')
  ownerId!: string;

  @Column({ type: 'boolean', default: false })
  isDissolved!: boolean;

  @Column({ type: 'boolean', default: true })
  joinRequireApproval!: boolean;

  @Column({ type: 'timestamp', nullable: true })
  dissolvedAt!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  dissolvedBy!: string | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'ownerId' })
  owner!: User;

  @OneToMany(() => GroupMember, (member) => member.group)
  members!: GroupMember[];

  @OneToMany(() => GroupInvite, (invite) => invite.group)
  invites!: GroupInvite[];
}
