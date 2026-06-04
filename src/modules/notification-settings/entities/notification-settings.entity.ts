import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

@Entity('notification_settings')
@Unique(['userId'])
export class NotificationSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { unique: true })
  userId: string;

  // Notification Preferences
  @Column({ type: 'boolean', default: true })
  groupNotifications: boolean; // Nhận thông báo từ nhóm

  @Column({ type: 'boolean', default: true })
  tagNotifications: boolean; // Nhận thông báo khi bị tag

  @Column({ type: 'boolean', default: false })
  muteAll: boolean; // Tắt tất cả thông báo

  // Additional Notification Settings
  @Column({ type: 'boolean', default: true })
  messageNotifications: boolean;

  @Column({ type: 'boolean', default: true })
  friendRequestNotifications: boolean;

  @Column({ type: 'boolean', default: true })
  callNotifications: boolean;

  @Column({ type: 'varchar', nullable: true, default: 'all' })
  notificationSound: string; // all, vibrate, silent

  @Column({ type: 'int', nullable: true, default: 0 })
  doNotDisturbStart: number; // Giờ bắt đầu (format 24h: 0-1440 minutes)

  @Column({ type: 'int', nullable: true, default: 0 })
  doNotDisturbEnd: number; // Giờ kết thúc

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
