import { User } from 'src/modules/users/entities/user.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum FriendshipStatus {
  ACTIVE = 'active',
  BLOCKED = 'blocked',
}

@Entity('friendship')
@Index(['userOne', 'userTwo'], { unique: true })
export class Friendship {
  @PrimaryGeneratedColumn('uuid')
  friendshipId: string;

  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  userOne: User;

  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  userTwo: User;

  @Column({
    type: 'enum',
    enum: FriendshipStatus,
    default: FriendshipStatus.ACTIVE,
  })
  status: FriendshipStatus;

  @Column({ type: 'uuid', nullable: true })
  blockedByUserId: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
