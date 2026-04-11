import { GroupConversation } from 'src/modules/conversation/entities/group-conversation.entity';
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

export enum GroupMemberRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member',
}

@Entity('group_member')
@Index(['group', 'user'], { unique: true })
export class GroupMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => GroupConversation, (group) => group.members, {
    eager: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'groupConversationId',
    referencedColumnName: 'conversationId',
  })
  group: GroupConversation;

  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  user: User;

  @Column({
    type: 'enum',
    enum: GroupMemberRole,
    default: GroupMemberRole.MEMBER,
  })
  role: GroupMemberRole;

  @CreateDateColumn()
  joinedAt: Date;
}
