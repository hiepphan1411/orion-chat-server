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
  UpdateDateColumn,
} from 'typeorm';

export enum GroupJoinRequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('group_join_request')
@Index(['group', 'requester', 'status'])
export class GroupJoinRequest {
  @PrimaryGeneratedColumn('uuid')
  requestId!: string;

  @ManyToOne(() => GroupConversation, {
    eager: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'groupConversationId',
    referencedColumnName: 'conversationId',
  })
  group!: GroupConversation;

  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requesterId' })
  requester!: User;

  @Column({
    type: 'enum',
    enum: GroupJoinRequestStatus,
    default: GroupJoinRequestStatus.PENDING,
  })
  status!: GroupJoinRequestStatus;

  @Column({ type: 'varchar', nullable: true })
  message!: string | null;

  @Column({ type: 'uuid', nullable: true })
  approvedBy!: string | null;

  @Column({ type: 'uuid', nullable: true })
  rejectedBy!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  respondedAt!: Date | null;
}
