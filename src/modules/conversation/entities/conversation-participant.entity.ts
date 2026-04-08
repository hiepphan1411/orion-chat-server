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

  // ==================== Security Features ====================

  // Ẩn trò chuyện: nếu true, conversation sẽ bị ẩn trong danh sách (cần nhập mật khẩu để xem)
  @Column({ type: 'boolean', default: false })
  isHidden: boolean;

  // Hash mật khẩu để ẩn conversation (bcrypt hash)
  @Column({ type: 'varchar', nullable: true })
  hidePasswordHash: string | null;

  // Chặn người dùng: nếu true, người dùng không thể gửi tin nhắn trong conversation này
  @Column({ type: 'boolean', default: false })
  isBlocked: boolean;

  // UUID của người chặn (để verify chỉ người chặn mới có thể bỏ chặn)
  @Column({ type: 'uuid', nullable: true })
  blockedBy: string | null;

  // Thời gian khi người dùng bị chặn
  @Column({ type: 'timestamp', nullable: true })
  blockedAt: Date | null;
}
