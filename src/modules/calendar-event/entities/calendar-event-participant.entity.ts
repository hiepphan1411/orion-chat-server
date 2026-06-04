import { GroupConversation } from '../../conversation/entities/group-conversation.entity';
import { User } from 'src/modules/users/entities/user.entity';
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { CalendarEvent } from './calendar-event.entity';

export enum CalendarParticipantType {
  FRIEND = 'friend',
  GROUP = 'group',
}

export enum CalendarParticipantStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
}

@Entity()
export class CalendarEventParticipant {
  @PrimaryGeneratedColumn('uuid')
  participantId: string;

  @ManyToOne(() => CalendarEvent, (event) => event.participants, {
    onDelete: 'CASCADE',
  })
  event: CalendarEvent;

  @Column({
    type: 'enum',
    enum: CalendarParticipantType,
  })
  type: CalendarParticipantType;

  @ManyToOne(() => User, { eager: true, nullable: true, onDelete: 'SET NULL' })
  user: User | null;

  @ManyToOne(() => GroupConversation, {
    eager: true,
    nullable: true,
    onDelete: 'SET NULL',
  })
  group: GroupConversation | null;

  @Column({
    type: 'enum',
    enum: CalendarParticipantStatus,
    default: CalendarParticipantStatus.PENDING,
  })
  status: CalendarParticipantStatus;

  @Column({ type: 'varchar' })
  displayName: string;

  @Column({ type: 'varchar', nullable: true })
  avatarUrl: string | null;
}
