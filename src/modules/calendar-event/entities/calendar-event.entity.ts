import { User } from 'src/modules/users/entities/user.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CalendarEventParticipant } from './calendar-event-participant.entity';

export enum CalendarEventCategory {
  PERSONAL = 'personal',
  MEETING = 'meeting',
  REMINDER = 'reminder',
  OTHER = 'other',
}

export enum CalendarEventRecurrence {
  NONE = 'none',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

@Entity()
export class CalendarEvent {
  @PrimaryGeneratedColumn('uuid')
  eventId: string;

  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  owner: User;

  @Column()
  title: string;

  @Column({ default: '' })
  description: string;

  @Column({ type: 'timestamptz' })
  startTime: Date;

  @Column({ type: 'timestamptz' })
  endTime: Date;

  @Column({ default: '#008080' })
  color: string;

  @Column({ default: '' })
  location: string;

  @Column({
    type: 'enum',
    enum: CalendarEventCategory,
    default: CalendarEventCategory.PERSONAL,
  })
  category: CalendarEventCategory;

  @Column({
    type: 'enum',
    enum: CalendarEventRecurrence,
    default: CalendarEventRecurrence.NONE,
  })
  recurrence: CalendarEventRecurrence;

  @Column({ default: 30 })
  notificationMinutes: number;

  @Column({ default: false })
  isAllDay: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  reminderSentAt: Date | null;

  @OneToMany(
    () => CalendarEventParticipant,
    (participant) => participant.event,
    {
      cascade: true,
      eager: true,
    },
  )
  participants: CalendarEventParticipant[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
